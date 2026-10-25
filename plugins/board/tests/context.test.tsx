import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

/** This session's board, under its project and its id. */
const BOARD = '/home/test/.cache/refined-claude-code/projects/-home-test-projects-app/session-1/board.md'

/**
 * Stands in for the engine beneath the mod: the session's home, directory and id, a file system
 * that keeps what is written, the tool list, and the classic events that carry context to the model.
 */
const world = async ($: Engine, on: On, files: Record<string, string> = {}) => {
  on('env.get', () => ({ value: '/home/test' }))
  on('session.cwd', () => ({ value: '/home/test/projects/app' }))
  on('session.id', () => ({ value: 'session-1' }))
  on('fs.read', ($, e) => (e.path in files ? { value: files[e.path] as string } : { deny: `ENOENT: ${e.path}` }))
  on('fs.write', ($, e) => {
    files[e.path] = e.text
    return { value: undefined }
  })
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('tool.register', ($, e) => ({ value: { tool: `mcp__board__${e.name}` } }))
  on('classic.SessionStart', () => ({}))
  on('classic.UserPromptSubmit', () => ({}))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/home/test/projects/app', surface: 'terminal', isInteractive: true })

  return {
    files,
    /** The context the session start hands the model. */
    start: async () => (await $.classic.SessionStart({ source: 'startup' })).additionalContext ?? [],
    /** Submits one prompt and answers the context the mod adds to it. */
    prompt: async () => (await $.classic.UserPromptSubmit({ prompt: 'Go on.' })).additionalContext ?? [],
    /** Calls the board tool as the model would. */
    call: async (input: Record<string, unknown>) => (await $.tool.call({ tool: 'mcp__board__board', ...input })).result,
  }
}

test('the session start names the board tool in one line', async ($, on) => {
  const { start } = await world($, on)

  const context = await start()
  expect(context).toHaveLength(1)
  expect(context[0]).toContain('mcp__board__board')
  expect(context[0]).toContain('multi-step')
  expect(context[0]).not.toContain('\n')
})

test('with pending items and no tool call for five turns, one reminder line comes on the next prompt', async ($, on) => {
  const { prompt, call } = await world($, on)
  await call({ action: 'add', text: 'Write the parser' })
  await call({ action: 'add', text: 'Add tests' })

  for (let turn = 1; turn <= 5; turn++) expect(await prompt()).toEqual([])
  expect(await prompt()).toEqual(['Board: 2 pending. Mark finished items done with the board tool.'])
  expect(await prompt()).toEqual([])
})

test('a tool call starts the count again', async ($, on) => {
  const { prompt, call } = await world($, on)
  await call({ action: 'add', text: 'Write the parser' })

  for (let turn = 1; turn <= 4; turn++) await prompt()
  await call({ action: 'add', text: 'Add tests' })
  for (let turn = 1; turn <= 5; turn++) expect(await prompt()).toEqual([])
  expect(await prompt()).toEqual(['Board: 2 pending. Mark finished items done with the board tool.'])
})

test('the reminderTurns option sets how many turns pass first', { options: { reminderTurns: 2 } }, async ($, on) => {
  const { prompt, call } = await world($, on)
  await call({ action: 'add', text: 'Write the parser' })

  expect(await prompt()).toEqual([])
  expect(await prompt()).toEqual([])
  expect(await prompt()).toEqual(['Board: 1 pending. Mark finished items done with the board tool.'])
})

test('nothing is injected when nothing is pending and nothing changed', async ($, on) => {
  const { prompt, call } = await world($, on)
  await call({ action: 'add', text: 'Write the parser' })
  await call({ action: 'done', item: 1 })

  for (let turn = 1; turn <= 12; turn++) expect(await prompt()).toEqual([])
})

test('a board changed outside the tool is listed once, numbered, on the next prompt', async ($, on) => {
  const { files, prompt, call } = await world($, on)
  await call({ action: 'add', text: 'Write the parser' })
  expect(await prompt()).toEqual([])

  files[BOARD] = '✓ Wrote the parser\n○ Add tests\n◇ Pick the cache dir\n'
  expect(await prompt()).toEqual([
    'The board changed outside the board tool. Current items:\n1. ✓ Wrote the parser\n2. ○ Add tests\n3. ◇ Pick the cache dir',
  ])
  expect(await prompt()).toEqual([])
})

test('a board already on disk when the session resumes is listed once', async ($, on) => {
  const { prompt } = await world($, on, { [BOARD]: '○ Add tests\n' })

  expect(await prompt()).toEqual(['The board changed outside the board tool. Current items:\n1. ○ Add tests'])
  expect(await prompt()).toEqual([])
})
