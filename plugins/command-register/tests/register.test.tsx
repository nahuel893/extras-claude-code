import { expect, test } from 'claude-code/testing'
import { engine, reply } from './engine'

test('every shell command in a reply is registered in order, prose and other fences left out', async ($, on) => {
  const { cc, copied } = await engine($, on)
  await $.session.append(
    reply(
      'r1',
      [
        'Check the service first:',
        '```bash',
        'systemctl status minecraft',
        '```',
        'Then, as a prompt:',
        '```',
        '$ journalctl -u minecraft -n 50',
        '$ df -h',
        '```',
        'Not a command:',
        '```python',
        'print("hi")',
        '```',
        '```',
        '!git status',
        '```',
      ].join('\n'),
    ),
  )

  await cc('1')
  await cc('2')
  await cc('3')
  expect(copied).toEqual(['systemctl status minecraft', 'journalctl -u minecraft -n 50\ndf -h', '!git status'])
  expect(await cc('4')).toBe('There is no command #4: the register holds #1 to #3.')
})

test('numbering continues across replies, and /cc <n> says what it copied', async ($, on) => {
  const { cc, copied } = await engine($, on)
  await $.session.append(reply('r1', '```sh\nls\n```'))
  await $.session.append(reply('r2', 'More:\n```zsh\npwd\n```\n```fish\nwhoami\n```'))

  expect(await cc('3')).toBe('Copied #3: whoami')
  expect(await cc(' 2 ')).toBe('Copied #2: pwd')
  expect(copied).toEqual(['whoami', 'pwd'])
})

test("a subagent's replies and the person's prompts are not registered", async ($, on) => {
  const { cc, copied } = await engine($, on)
  await $.session.append(reply('r1', '```bash\nrm -rf build\n```', 'agent-1'))
  await $.session.append({
    message: { type: 'user', role: 'user', content: [{ type: 'text', text: '```bash\necho mine\n```' }] },
    door: 'prompt',
    origin: { kind: 'composer' },
    uuid: 'p1',
  })

  expect(await cc('1')).toBe('No shell commands yet: the register fills as Claude gives them.')
  expect(copied).toEqual([])
})

test('a row appended twice is registered once', async ($, on) => {
  const { cc } = await engine($, on)
  await $.session.append(reply('r1', '```bash\nmake\n```'))
  await $.session.append(reply('r1', '```bash\nmake\n```'))

  expect(await cc('2')).toBe('There is no command #2: the register holds #1 to #1.')
})

test('a number that is not one answers a notice', async ($, on) => {
  const { cc, copied } = await engine($, on)
  await $.session.append(reply('r1', '```bash\nmake\n```'))

  expect(await cc('0')).toBe('There is no command #0: the register holds #1 to #1.')
  expect(await cc('two')).toBe('Usage: /cc to pick from the list, or /cc <n> to copy command n.')
  expect(copied).toEqual([])
})

test('a /clear starts the register over', async ($, on) => {
  const { cc } = await engine($, on)
  await $.session.append(reply('r1', '```bash\nmake\n```'))
  await $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } })

  expect(await cc('1')).toBe('No shell commands yet: the register fills as Claude gives them.')
})
