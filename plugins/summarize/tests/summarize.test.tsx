import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { summaryPath, summaryText, transcriptOf } from '../hooks/summary'

const USAGE = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

type World = {
  /** What the model answers: its text, or a reason it has none. */
  reply?: { text: string } | { reason: 'api-error' | 'empty-reply' | 'aborted' }
  messages?: { role: 'user' | 'assistant'; text: string }[]
}

/**
 * Stands in for the engine beneath the mod: the session's home, id and conversation, the model,
 * the file system and the toasts, each recorded so a test reads what `/summ` did.
 */
const world = async ($: Engine, on: On, { reply = { text: 'The goal was a parser. It is written.' }, messages }: World = {}) => {
  const clock = mock.clock(on, { now: 0 })
  const asked: { model: string; prompt: string; system?: string }[] = []
  const writes: { path: string; text: string }[] = []
  const toasts: string[] = []
  on('env.get', () => ({ value: '/home/test' }))
  on('session.id', () => ({ value: 'session-1' }))
  on('session.messages', () => ({
    value: (messages ?? [
      { role: 'user', text: 'Write the parser.' },
      { role: 'assistant', text: 'The parser is written.' },
    ]).map(message => ({ ...message, toolUses: [] })) as never,
  }))
  on('model.complete', ($, e) => {
    asked.push({ model: e.model, prompt: e.prompt, ...(e.system === undefined ? {} : { system: e.system }) })
    return { value: ('text' in reply ? { isAnswered: true, text: reply.text, usage: USAGE } : { isAnswered: false, reason: reply.reason, status: 500, error: 'server_error', usage: USAGE }) as never }
  })
  on('fs.write', ($, e) => {
    writes.push({ path: e.path, text: e.text })
    return { value: undefined }
  })
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/home/test/projects/app', surface: 'terminal', isInteractive: true })

  return {
    asked,
    writes,
    toasts,
    /** Runs `/summ`, answers its line, then lets the background summary finish. */
    summ: async () => {
      const { text } = await $.command.run({ command: 'summ', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
      await clock.settle()
      return text
    },
  }
}

test('the summary file is named after the session id', async () => {
  expect(summaryPath('/home/user', 'abc-123')).toBe('/home/user/.cache/extras-claude-code/summaries/abc-123.md')
})

test("the summary is the model's reply trimmed, a leading heading dropped", async () => {
  expect(summaryText('\n# Summary\n\nThe goal was a parser.\n\nIt is written.  \n')).toBe('The goal was a parser.\n\nIt is written.')
  expect(summaryText('   \n')).toBe('')
})

test('the transcript keeps user and assistant text, reminders dropped, cut to its last characters', async () => {
  const text = transcriptOf(
    [
      { role: 'user', text: 'Hello <system-reminder>secret note</system-reminder>there' },
      { role: 'assistant', text: '' },
      { role: 'assistant', text: 'Hi.' },
    ],
    1000,
  )
  expect(text).toBe('User: Hello there\n\nAssistant: Hi.')
  expect(transcriptOf([{ role: 'user', text: 'abcdefghij' }], 4)).toBe('ghij')
})

test('/summ answers at once, then writes the summary and says so', async ($, on) => {
  const { asked, writes, toasts, summ } = await world($, on)

  expect(await summ()).toBe('Summarizing the session…')
  expect(asked).toHaveLength(1)
  expect(asked[0]?.model).toBe('claude-haiku-5-5')
  expect(asked[0]?.prompt).toContain('User: Write the parser.')
  expect(asked[0]?.system).toContain('150 words')
  expect(writes).toEqual([
    { path: '/home/test/.cache/extras-claude-code/summaries/session-1.md', text: 'The goal was a parser. It is written.\n' },
  ])
  expect(toasts).toEqual(['Summary updated'])
})

test('the model option picks the model', { options: { model: 'haiku' } }, async ($, on) => {
  const { asked, summ } = await world($, on)
  await summ()

  expect(asked[0]?.model).toBe('haiku')
})

test('a failed model call leaves the file alone and says why', async ($, on) => {
  const { writes, toasts, summ } = await world($, on, { reply: { reason: 'empty-reply' } })
  await summ()

  expect(writes).toEqual([])
  expect(toasts).toEqual(['Summary not updated: empty-reply'])
})

test('a blank reply leaves the file alone and says why', async ($, on) => {
  const { writes, toasts, summ } = await world($, on, { reply: { text: '  \n' } })
  await summ()

  expect(writes).toEqual([])
  expect(toasts).toEqual(["Summary not updated: the model's reply was empty"])
})

test('an empty conversation asks no model', async ($, on) => {
  const { asked, writes, toasts, summ } = await world($, on, { messages: [] })
  await summ()

  expect(asked).toEqual([])
  expect(writes).toEqual([])
  expect(toasts).toEqual(['Summary not updated: the conversation is empty'])
})
