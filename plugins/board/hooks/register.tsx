import type { EngineInterface, Register } from 'claude-code'
import { boardLines, boardPath, promptOf, SYSTEM, transcriptOf } from './board'
import { applyCall, TOOL_DESCRIPTION, TOOL_NAME, TOOL_SCHEMA } from './tool'

const DEFAULT_MODEL = 'claude-haiku-5-5'

/** How much of the conversation the model reads, from its end: the latest work, at a bounded cost. */
const TRANSCRIPT_CHARS = 60_000

/** How long the model may take before the update gives up. */
const TIMEOUT_MS = 120_000

/** The board tool as the model calls it: `mcp__<plugin>__<name>`. */
const TOOL = `mcp__board__${TOOL_NAME}`

/** This session's board file, or why there is none. */
async function sessionBoard($: EngineInterface): Promise<{ path: string } | { reason: string }> {
  const home = await $.env.get('HOME')
  if (!home) return { reason: 'HOME is not set' }
  return { path: boardPath(home, await $.session.cwd(), await $.session.id()) }
}

/**
 * Applies one board tool call to this session's board file and answers the line the model reads.
 * A call that cannot apply writes nothing; a failure is a reply too, never a throw.
 */
async function callTool($: EngineInterface, input: Record<string, unknown>): Promise<string> {
  try {
    const board = await sessionBoard($)
    if ('reason' in board) return `Board not changed: ${board.reason}`

    const previous = await $.fs.read(board.path).catch(() => '')
    const { board: next, reply } = applyCall(previous, input)
    if (next !== undefined) await $.fs.write(board.path, next)
    return reply
  } catch (error) {
    return `Board not changed: ${error instanceof Error ? error.message : String(error)}`
  }
}

/**
 * Rewrites this session's board: the conversation and the session's previous board to the model,
 * its reply cleaned to board lines and written to the session's file under its project. A new
 * session has no file yet, so it starts from an empty board. Every outcome is a toast, as nobody
 * waits on the command's line by then.
 */
async function updateBoard($: EngineInterface, model: string) {
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
    $.ui.toast('Board updated')
  } catch (error) {
    $.ui.toast(`Board not updated: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export const register: Register = (on, options) => {
  const model = typeof options.model === 'string' && options.model.trim() ? options.model.trim() : DEFAULT_MODEL
  // One update at a time: a second /board while the model works would race it to the file.
  let isUpdating = false

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
    if (isUpdating) return { text: 'The board is already being updated.' }

    isUpdating = true
    $.clock.after(0, () => {
      void updateBoard($, model).finally(() => {
        isUpdating = false
      })
    })

    return { text: 'Updating the board…' }
  })

  // The model's arguments ride beside the call's own keys; the tool reads only its own three.
  on('tool.call', { tool: TOOL }, async ($, e) => ({ result: await callTool($, e as Record<string, unknown>) }))
}
