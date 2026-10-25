import type { EngineInterface, Register } from 'claude-code'
import { boardLines, boardPath, promptOf, SYSTEM, transcriptOf } from './board'
import { applyCall, boardText, BUSY, changedOf, hintOf, pendingOf, reminderOf, TOOL_DESCRIPTION, TOOL_NAME, TOOL_SCHEMA } from './tool'

const DEFAULT_MODEL = 'claude-haiku-5-5'

/** How much of the conversation the model reads, from its end: the latest work, at a bounded cost. */
const TRANSCRIPT_CHARS = 60_000

/** How long the model may take before the update gives up. */
const TIMEOUT_MS = 120_000

/** The board tool as the model calls it: `mcp__<plugin>__<name>`. */
const TOOL = `mcp__board__${TOOL_NAME}`

/** How many user turns may pass with pending items and no board tool call before a reminder. */
const REMINDER_TURNS = 5

/**
 * How long a board tool call waits for a running /board before it gives up: the engine bounds a
 * hook's own time to 10 s per dispatch, and a `$.clock.sleep` counts against it.
 */
const WAIT_MS = 7_000

/** How much of the hook's own time the wait always leaves for the call itself. */
const MARGIN_MS = 2_000

/** How often a waiting call looks whether /board has finished. */
const POLL_MS = 250

/** This session's board file, or why there is none. */
async function sessionBoard($: EngineInterface): Promise<{ path: string } | { reason: string }> {
  const home = await $.env.get('HOME')
  if (!home) return { reason: 'HOME is not set' }
  return { path: boardPath(home, await $.session.cwd(), await $.session.id()) }
}

/** This session's board as file text: its board lines alone, or empty when there is no file. */
async function readBoard($: EngineInterface, path: string) {
  return boardText(boardLines(await $.fs.read(path).catch(() => '')))
}

/**
 * What the mod remembers of the model's view of the board, for the session (a reload starts over).
 *
 * `known` is the board as the model last saw it, through the tool or a listing: a file that differs
 * from it was changed outside the tool. A new session has no file, which reads as an empty board.
 * `generation` is the count of /board rewrites as of that moment. `quietTurns` counts the user turns
 * since the model last called the tool or was reminded.
 */
type Seen = { known: string; generation: number; quietTurns: number; reminderTurns: number }

/**
 * What keeps /board and the board tool off each other's writes. `isRewriting` holds while /board
 * runs, and tool calls write nothing then; `tool` settles once the tool's writes in flight have,
 * and /board waits for it before it reads the board; `generation` counts /board's rewrites.
 */
type Lock = { isRewriting: boolean; tool: Promise<void>; generation: number }

/** Waits, within `waitMs` of the hook's own time, for a running /board to finish; false if it has not. */
async function rewriteDone($: EngineInterface, lock: Lock, waitMs: number, signal: AbortSignal): Promise<boolean> {
  try {
    for (let waited = 0; lock.isRewriting && waited < waitMs; waited += POLL_MS) await $.clock.sleep(POLL_MS, { signal })
  } catch {
    return false
  }
  return !lock.isRewriting
}

/**
 * Applies one board tool call to this session's board file and answers what the model reads. A
 * board that changed since the model last saw it is shown numbered: `done` and `wait`, whose numbers
 * were meant for the old board, are refused; `add` applies. A call that cannot apply writes nothing;
 * a failure is a reply too, never a throw.
 */
async function applyTool($: EngineInterface, seen: Seen, lock: Lock, input: Record<string, unknown>): Promise<string> {
  try {
    const board = await sessionBoard($)
    if ('reason' in board) return `Board not changed: ${board.reason}`

    const current = await readBoard($, board.path)
    const isStale = current !== seen.known
    const isRewrite = lock.generation !== seen.generation
    seen.known = current
    seen.generation = lock.generation
    if (isStale && (input.action === 'done' || input.action === 'wait')) {
      return `${changedOf(boardLines(current), isRewrite)}\nCall again.`
    }

    const { board: next, reply } = applyCall(current, input)
    if (next !== undefined) {
      await $.fs.write(board.path, next)
      seen.known = next
    }
    return isStale ? `${reply}\n${changedOf(boardLines(seen.known), isRewrite)}` : reply
  } catch (error) {
    return `Board not changed: ${error instanceof Error ? error.message : String(error)}`
  }
}

/**
 * Serves one board tool call: waits a bounded while for a running /board, then applies the call
 * after the tool's other writes in flight, so neither /board nor another call writes over it.
 */
async function callTool(
  $: EngineInterface,
  seen: Seen,
  lock: Lock,
  input: Record<string, unknown>,
  waitMs: number,
  signal: AbortSignal,
): Promise<string> {
  seen.quietTurns = 0
  if (!(await rewriteDone($, lock, waitMs, signal))) return BUSY

  // No await between the check above and this line: /board cannot start in between unseen.
  const applied = lock.tool.then(() => applyTool($, seen, lock, input))
  lock.tool = applied.then(
    () => undefined,
    () => undefined,
  )
  return applied
}

/**
 * What the next prompt hands the model about the board: the numbered list once after an outside
 * change, else one reminder line when items are pending and the tool sat unused for long enough.
 */
async function promptContext($: EngineInterface, seen: Seen, lock: Lock): Promise<string[]> {
  seen.quietTurns += 1
  const board = await sessionBoard($)
  if ('reason' in board) return []

  const current = await readBoard($, board.path)
  const lines = boardLines(current)
  if (current !== seen.known) {
    const isRewrite = lock.generation !== seen.generation
    seen.known = current
    seen.generation = lock.generation
    if (lines.length) {
      seen.quietTurns = 0
      return [changedOf(lines, isRewrite)]
    }
  }

  const pending = pendingOf(lines)
  if (pending > 0 && seen.quietTurns > seen.reminderTurns) {
    seen.quietTurns = 0
    return [reminderOf(pending)]
  }
  return []
}

/**
 * Rewrites this session's board: the conversation and the session's previous board to the model,
 * its reply cleaned to board lines and written to the session's file under its project. A new
 * session has no file yet, so it starts from an empty board. Every outcome is a toast, as nobody
 * waits on the command's line by then. It reads the board only once the tool's writes in flight have
 * settled, and counts a rewrite it wrote in `lock.generation`.
 */
async function updateBoard($: EngineInterface, model: string, lock: Lock) {
  try {
    const transcript = transcriptOf(await $.session.messages(), TRANSCRIPT_CHARS)
    if (!transcript) {
      $.ui.toast('Board not updated: the conversation is empty')
      return
    }

    const board = await sessionBoard($)
    if ('reason' in board) {
      $.ui.toast(`Board not updated: ${board.reason}`)
      return
    }
    const { path } = board
    await lock.tool
    const previous = await $.fs.read(path).catch(() => '')

    const reply = await $.model.complete({ model, system: SYSTEM, prompt: promptOf(previous, transcript), timeoutMs: TIMEOUT_MS })
    if (!reply.isAnswered) {
      $.ui.toast(`Board not updated: ${reply.reason}`)
      return
    }

    const lines = boardLines(reply.text)
    if (lines.length === 0) {
      $.ui.toast("Board not updated: the model's reply had no board lines")
      return
    }

    await $.fs.write(path, `${lines.join('\n')}\n`)
    lock.generation += 1
    $.ui.toast('Board updated')
  } catch (error) {
    $.ui.toast(`Board not updated: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export const register: Register = (on, options) => {
  const model = typeof options.model === 'string' && options.model.trim() ? options.model.trim() : DEFAULT_MODEL
  const reminderTurns =
    typeof options.reminderTurns === 'number' && options.reminderTurns >= 1 ? Math.floor(options.reminderTurns) : REMINDER_TURNS
  const seen: Seen = { known: '', generation: 0, quietTurns: 0, reminderTurns }
  // One /board at a time, and no tool write while it runs: either would race it to the file.
  const lock: Lock = { isRewriting: false, tool: Promise.resolve(), generation: 0 }

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'board',
      description: "Update this session's board of done, pending and waiting items from the conversation",
    })
    await $.tool.register({ name: TOOL_NAME, description: TOOL_DESCRIPTION, inputSchema: TOOL_SCHEMA })

    return next(e)
  })

  // The command answers at once and the model works on a timer of its own: a hook's dispatch is
  // bounded, and a timer outlives it.
  on('command.run', { command: 'board' }, async $ => {
    if (lock.isRewriting) return { text: 'The board is already being updated.' }

    lock.isRewriting = true
    $.clock.after(0, () => {
      void updateBoard($, model, lock).finally(() => {
        lock.isRewriting = false
      })
    })

    return { text: 'Updating the board…' }
  })

  // MCP tools may wait behind ToolSearch, where the model sees the name alone: one line says when to use it.
  on('classic.SessionStart', async ($, e, next) => {
    const result = await next(e)
    return { ...result, additionalContext: [...(result.additionalContext ?? []), hintOf(TOOL)] }
  })

  on('classic.UserPromptSubmit', async ($, e, next) => {
    const result = await next(e)
    const context = await promptContext($, seen, lock).catch(() => [])
    return context.length ? { ...result, additionalContext: [...(result.additionalContext ?? []), ...context] } : result
  })

  // The model's arguments ride beside the call's own keys; the tool reads only its own three. A
  // call waits for a running /board only as long as the hook's own time allows.
  on('tool.call', { tool: TOOL }, async ($, e, next) => {
    const waitMs = Math.min(WAIT_MS, next.budget.remainingMs - MARGIN_MS)
    return { result: await callTool($, seen, lock, e as Record<string, unknown>, waitMs, next.signal) }
  })
}
