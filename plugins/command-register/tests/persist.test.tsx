import { expect, test } from 'claude-code/testing'
import { engine, REGISTER_FILE, reply } from './engine'

const prompt = ($: Parameters<typeof engine>[0]) => $.prompt.submit({ text: 'next', wait: false, origin: { kind: 'composer' } })
const stored = (files: Record<string, string>) => JSON.parse(files[REGISTER_FILE] ?? 'null')

test('an append that adds commands writes this session file', async ($, on) => {
  const { files } = await engine($, on)
  await prompt($)
  await $.session.append(reply('r1', '```sh\nls\n```'))

  expect(stored(files)).toEqual([{ turn: 1, row: 'r1', text: 'ls' }])
})

test('a reply without commands writes nothing', async ($, on) => {
  const { writes } = await engine($, on)
  await $.session.append(reply('r1', 'no commands here'))

  expect(writes).toEqual([])
})

test('a /clear writes an empty list', async ($, on) => {
  const { files } = await engine($, on)
  await $.session.append(reply('r1', '```sh\nls\n```'))
  await $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } })

  expect(stored(files)).toEqual([])
})

test('session.start with an empty register restores the commands and the turn', async ($, on) => {
  const saved = [
    { turn: 1, row: 'r1', text: 'ls' },
    { turn: 3, row: 'r2', text: 'pwd' },
  ]
  const { cc, copied } = await engine($, on, undefined, { files: { [REGISTER_FILE]: JSON.stringify(saved) } })

  expect(await cc('1')).toBe('Copied #1: pwd')
  // The next prompt is turn 4, so its commands do not join the restored message of turn 3.
  await prompt($)
  await $.session.append(reply('r3', '```sh\nwhoami\n```'))
  expect(await cc('1')).toBe('Copied #1: whoami')
  expect(copied).toEqual(['pwd', 'whoami'])
})

for (const [name, text] of [
  ['a corrupt file', '{not json'],
  ['a file that is not a list', '{"a":1}'],
  ['a list of something else', '[{"turn":"x"}]'],
  ['a missing file', undefined],
] as const) {
  test(`${name} gives an empty register`, async ($, on) => {
    const { ccNow } = await engine($, on, undefined, { files: text === undefined ? {} : { [REGISTER_FILE]: text } })

    expect(await ccNow()).toContain('No shell commands yet')
  })
}

test('a write failure does not break the append, and toasts once', async ($, on) => {
  const { toasts, ccNow } = await engine($, on, undefined, { failWrites: true })
  await $.session.append(reply('r1', '```sh\nls\n```'))
  await $.session.append(reply('r2', '```sh\npwd\n```'))

  expect(await ccNow('1')).toBe('Copied #1: ls')
  expect(toasts).toHaveLength(1)
})
