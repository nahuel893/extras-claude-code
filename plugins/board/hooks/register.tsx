import type { EngineInterface, Register } from 'claude-code'
import { boardLines, boardPath, promptOf, SYSTEM, transcriptOf } from './board'

const DEFAULT_MODEL = 'claude-haiku-5-5'

/** How much of the conversation the model reads, from its end: the latest work, at a bounded cost. */
const TRANSCRIPT_CHARS = 60_000

/** How long the model may take before the update gives up. */
const TIMEOUT_MS = 120_000

/**
 * Rewrites the board of this session's project: the conversation and the previous board to the
 * model, its reply cleaned to board lines and written to the project's file. Every outcome is a
 * toast, as nobody waits on the command's line by then.
 */
async function updateBoard($: EngineInterface, model: string) {
  try {
    const transcript = transcriptOf(await $.session.messages(), TRANSCRIPT_CHARS)
    if (!transcript) {
      $.ui.toast('Board not updated: the conversation is empty')
      return
    }

    const home = await $.env.get('HOME')
    if (!home) {
      $.ui.toast('Board not updated: HOME is not set')
      return
    }
    const path = boardPath(home, await $.session.cwd())
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
      description: "Update this project's board of done, pending and waiting items from the conversation",
    })

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
}
