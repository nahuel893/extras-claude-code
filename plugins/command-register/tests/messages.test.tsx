import { expect, test } from 'claude-code/testing'
import { engine, reply } from './engine'

const fence = (command: string) => '```bash\n' + command + '\n```'
const prompt = ($: Parameters<typeof engine>[0], text = 'next') => $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })

// T1: a message is everything Claude answered to one prompt

test('every block of one turn is one message, numbered in the order it appeared', async ($, on) => {
  const { cc, copied } = await engine($, on)
  await prompt($, 'first')
  await $.session.append(reply('r1', 'Look:\n' + fence('ls')))
  await $.session.append(reply('r2', 'Then:\n' + fence('pwd')))

  expect(await cc('1')).toBe('Copied #1: ls')
  expect(await cc('2')).toBe('Copied #2: pwd')
  expect(copied).toEqual(['ls', 'pwd'])
})

test('/cc <n> counts inside the latest message, not the whole session', async ($, on) => {
  const { cc, copied } = await engine($, on)
  await prompt($, 'first')
  await $.session.append(reply('r1', fence('old one') + '\n' + fence('old two')))
  await prompt($, 'second')
  await $.session.append(reply('r2', fence('new one')))

  expect(await cc('1')).toBe('Copied #1: new one')
  expect(await cc('2')).toBe('There is no command #2: the latest message holds #1 to #1.')
  expect(copied).toEqual(['new one'])
})

test('a later message without commands is skipped', async ($, on) => {
  const { cc } = await engine($, on)
  await prompt($, 'first')
  await $.session.append(reply('r1', fence('make')))
  await prompt($, 'second')
  await $.session.append(reply('r2', 'No command needed here.'))

  expect(await cc('1')).toBe('Copied #1: make')
})

test('a /clear starts the messages over', async ($, on) => {
  const { cc } = await engine($, on)
  await prompt($, 'first')
  await $.session.append(reply('r1', fence('make')))
  await $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } })
  await prompt($, 'again')
  await $.session.append(reply('r2', fence('ls')))

  expect(await cc('1')).toBe('Copied #1: ls')
  expect(await cc('2')).toBe('There is no command #2: the latest message holds #1 to #1.')
})
