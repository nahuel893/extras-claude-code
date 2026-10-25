import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { boardLines, boardPath, slugOf, transcriptOf } from '../hooks/board'

const USAGE = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

type World = {
  /** What the model answers: its text, or a reason it has none. */
  reply?: { text: string } | { reason: 'api-error' | 'empty-reply' | 'aborted' }
  /** The board file already there, if any. */
  previous?: string
  messages?: { role: 'user' | 'assistant'; text: string }[]
}

/**
 * Stands in for the engine beneath the mod: the session's home, directory and conversation, the
 * model, the file system and the toasts, each recorded so a test reads what `/board` did.
 */
const world = async ($: Engine, on: On, { reply = { text: '✓ Wrote the parser\n○ Add tests' }, previous, messages }: World = {}) => {
  const clock = mock.clock(on, { now: 0 })
  const asked: { model: string; prompt: string; system?: string }[] = []
  const writes: { path: string; text: string }[] = []
  const toasts: string[] = []
  on('env.get', () => ({ value: '/home/test' }))
  on('session.cwd', () => ({ value: '/home/test/projects/app' }))
  on('session.messages', () => ({
    value: (messages ?? [
      { role: 'user', text: 'Write the parser, then add tests.' },
      { role: 'assistant', text: 'The parser is written.' },
    ]).map(message => ({ ...message, toolUses: [] })) as never,
  }))
  on('model.complete', ($, e) => {
    asked.push({ model: e.model, prompt: e.prompt, ...(e.system === undefined ? {} : { system: e.system }) })
    return { value: ('text' in reply ? { isAnswered: true, text: reply.text, usage: USAGE } : { isAnswered: false, reason: reply.reason, status: 500, error: 'server_error', usage: USAGE }) as never }
  })
  on('fs.read', ($, e) => (previous === undefined ? { deny: `ENOENT: ${e.path}` } : { value: previous }))
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
    /** Runs `/board`, answers its line, then lets the background update finish. */
    board: async () => {
      const { text } = await $.command.run({ command: 'board', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
      await clock.settle()
      return text
    },
  }
}

test('the slug is the directory with every slash a dash', async () => {
  expect(slugOf('/home/user/projects/x')).toBe('-home-user-projects-x')
  expect(boardPath('/home/user', '/home/user/projects/x')).toBe('/home/user/.cache/extras-claude-code/board/-home-user-projects-x.md')
})

test("only the board's lines are kept, bullets before a mark dropped", async () => {
  expect(boardLines('Here is the board:\n\n- ✓ Done one\n○ Pending two\n  ◇ Ask about three  \n* nothing\n')).toEqual([
    '✓ Done one',
    '○ Pending two',
    '◇ Ask about three',
  ])
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

test('/board answers at once, then writes the board and says so', async ($, on) => {
  const { asked, writes, toasts, board } = await world($, on)

  expect(await board()).toBe('Updating the board…')
  expect(asked).toHaveLength(1)
  expect(asked[0]?.model).toBe('claude-haiku-5-5')
  expect(asked[0]?.prompt).toContain('User: Write the parser, then add tests.')
  expect(asked[0]?.system).toContain('◇ ')
  expect(writes).toEqual([
    { path: '/home/test/.cache/extras-claude-code/board/-home-test-projects-app.md', text: '✓ Wrote the parser\n○ Add tests\n' },
  ])
  expect(toasts).toEqual(['Board updated'])
})

test('the previous board goes to the model with the conversation', async ($, on) => {
  const { asked, board } = await world($, on, { previous: '○ Write the parser\n' })
  await board()

  expect(asked[0]?.prompt).toContain('○ Write the parser')
})

test('the model option picks the model', { options: { model: 'haiku' } }, async ($, on) => {
  const { asked, board } = await world($, on)
  await board()

  expect(asked[0]?.model).toBe('haiku')
})

test('a reply with no board lines leaves the file alone and says why', async ($, on) => {
  const { writes, toasts, board } = await world($, on, { reply: { text: 'I cannot help with that.' } })
  await board()

  expect(writes).toEqual([])
  expect(toasts).toEqual(["Board not updated: the model's reply had no board lines"])
})

test('a failed model call leaves the file alone and says why', async ($, on) => {
  const { writes, toasts, board } = await world($, on, { reply: { reason: 'api-error' } })
  await board()

  expect(writes).toEqual([])
  expect(toasts).toEqual(['Board not updated: api-error'])
})

test('an empty conversation asks no model', async ($, on) => {
  const { asked, writes, toasts, board } = await world($, on, { messages: [] })
  await board()

  expect(asked).toEqual([])
  expect(writes).toEqual([])
  expect(toasts).toEqual(['Board not updated: the conversation is empty'])
})
