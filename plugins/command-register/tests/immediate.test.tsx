import { expect, test } from 'claude-code/testing'
import { engine, reply } from './engine'

test('/cc is registered to run while Claude is still answering', async ($, on) => {
  const { registered } = await engine($, on)

  expect(registered.find(command => command.name === 'cc')?.immediate).toBe(true)
})

test('/cc shows the blocks already appended, with no turn having ended', async ($, on) => {
  const { cc, opened } = await engine($, on)
  // A block of a reply still being written: appended, but no turn.complete has come.
  await $.session.append(reply('r1', '```sh\nls\n```'))

  expect(await cc()).toContain('Command panel open')
  expect(opened).toHaveLength(1)
})
