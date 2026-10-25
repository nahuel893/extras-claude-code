import type { EngineInterface, Register } from 'claude-code'
import { promptOf, summaryPath, summaryText, SYSTEM, transcriptOf } from './summary'

const DEFAULT_MODEL = 'claude-haiku-5-5'

/** How much of the conversation the model reads, from its end: the latest work, at a bounded cost. */
const TRANSCRIPT_CHARS = 60_000

/** How long the model may take before the summary gives up. */
const TIMEOUT_MS = 120_000

/**
 * Writes this session's summary: the conversation to the model, its reply to the session's file
 * under its project.
 * Every outcome is a toast, as nobody waits on the command's line by then.
 */
async function summarize($: EngineInterface, model: string) {
  try {
    const transcript = transcriptOf(await $.session.messages(), TRANSCRIPT_CHARS)
    if (!transcript) {
      $.ui.toast('Summary not updated: the conversation is empty')
      return
    }

    const home = await $.env.get('HOME')
    if (!home) {
      $.ui.toast('Summary not updated: HOME is not set')
      return
    }
    const path = summaryPath(home, await $.session.cwd(), await $.session.id())

    const reply = await $.model.complete({ model, system: SYSTEM, prompt: promptOf(transcript), timeoutMs: TIMEOUT_MS })
    if (!reply.isAnswered) {
      $.ui.toast(`Summary not updated: ${reply.reason}`)
      return
    }

    const text = summaryText(reply.text)
    if (!text) {
      $.ui.toast("Summary not updated: the model's reply was empty")
      return
    }

    await $.fs.write(path, `${text}\n`)
    $.ui.toast('Summary updated')
  } catch (error) {
    $.ui.toast(`Summary not updated: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export const register: Register = (on, options) => {
  const model = typeof options.model === 'string' && options.model.trim() ? options.model.trim() : DEFAULT_MODEL
  // One summary at a time: a second /summ while the model works would race it to the file.
  let isSummarizing = false

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'summ', description: 'Write a short summary of this session' })

    return next(e)
  })

  // The command answers at once and the model works on a timer of its own: a hook's dispatch is
  // bounded, and a timer outlives it.
  on('command.run', { command: 'summ' }, async $ => {
    if (isSummarizing) return { text: 'The summary is already being written.' }

    isSummarizing = true
    $.clock.after(0, () => {
      void summarize($, model).finally(() => {
        isSummarizing = false
      })
    })

    return { text: 'Summarizing the session…' }
  })
}
