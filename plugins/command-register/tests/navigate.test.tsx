import { expect, test } from 'claude-code/testing'
import { engine, pane, reply } from './engine'

let id = 0
const fence = (command: string) => '```bash\n' + command + '\n```'
const prompt = ($: Parameters<typeof engine>[0]) => $.prompt.submit({ text: 'next', wait: false, origin: { kind: 'composer' } })

/** One message per entry: a prompt, then Claude's reply holding those commands in order. */
const messages = async ($: Parameters<typeof engine>[0], ...turns: string[][]) => {
  for (const commands of turns) {
    await prompt($)
    await $.session.append(reply(`n${++id}`, commands.map(fence).join('\nand\n')))
  }
}

type Finder = { findAll: (q: { type: string }) => Promise<{ key?: string; props: Record<string, unknown> }[]> }
const rowButtons = async (ui: Finder) => (await ui.findAll({ type: 'Button' })).filter(button => String(button.key).startsWith('command:'))
const labels = async (ui: Finder) => (await rowButtons(ui)).map(row => row.props.label)

// T3: moving between messages

test('‹ and › are Buttons with the letters h and l', async ($, on) => {
  const { cc } = await engine($, on)
  await messages($, ['a'], ['b'])
  await cc()

  const ui = await $.ui.mount(pane())
  const buttons = await ui.findAll({ type: 'Button' })
  const older = buttons.find(button => button.key === 'older')
  const newer = buttons.find(button => button.key === 'newer')
  expect([older?.props.label, older?.props.hotkey]).toEqual(['‹', 'h'])
  expect([newer?.props.label, newer?.props.hotkey]).toEqual(['›', 'l'])
  await ui.unmount()
})

test('‹ shows the older message and › the newer one, the ends holding still', async ($, on) => {
  const { cc } = await engine($, on)
  await messages($, ['one', 'uno'], ['two'], ['three'])
  await cc()

  const ui = await $.ui.mount(pane())
  expect(await labels(ui)).toEqual(['three'])
  await ui.press({ key: 'newer' })
  expect(await labels(ui)).toEqual(['three'])

  await ui.press({ key: 'older' })
  expect(await labels(ui)).toEqual(['two'])
  expect((await ui.find({ type: 'Text', text: /message 2 of 3/ }))?.text).toContain('message 2 of 3')
  await ui.press({ key: 'older' })
  await ui.press({ key: 'older' })
  expect(await labels(ui)).toEqual(['one', 'uno'])
  expect((await ui.find({ type: 'Text', text: /message 1 of 3/ }))?.text).toContain('message 1 of 3')

  await ui.press({ key: 'newer' })
  expect(await labels(ui)).toEqual(['two'])
  await ui.unmount()
})

test('switching message clears the filter and the ring', async ($, on) => {
  const { cc } = await engine($, on)
  await messages($, ['alpha', 'beta'], ['gamma', 'delta'])
  await cc()

  const ui = await $.ui.mount(pane())
  await ui.input({ key: 'filter', text: 'delta', kind: 'change' })
  expect(await labels(ui)).toEqual(['delta'])
  await ui.press({ key: 'older' })
  expect(await labels(ui)).toEqual(['alpha', 'beta'])
  await ui.unmount()
})

test('opening /cc again starts on the latest message with no filter', async ($, on) => {
  const { cc } = await engine($, on)
  await messages($, ['old'], ['new', 'newer'])
  await cc()
  const first = await $.ui.mount(pane())
  await first.press({ key: 'older' })
  await first.input({ key: 'filter', text: 'zzz', kind: 'change' })
  await first.unmount()

  await cc()
  const ui = await $.ui.mount(pane())
  expect(await labels(ui)).toEqual(['new', 'newer'])
  await ui.unmount()
})

// T3: digits, copy and close

test('a digit is the hotkey of the row at that place; rows past nine have none but a number', async ($, on) => {
  const { cc } = await engine($, on)
  await messages($, Array.from({ length: 11 }, (_, n) => `echo ${n + 1}`))
  await cc()

  const ui = await $.ui.mount(pane())
  const rows = await rowButtons(ui)
  expect(rows.slice(0, 9).map(row => row.props.hotkey)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9'])
  expect(rows.slice(9).map(row => row.props.hotkey)).toEqual([undefined, undefined])
  expect(rows[10]?.props.label).toBe('11: echo 11')
  await ui.unmount()
})

test("pressing a row's digit copies that command, closes the pane and toasts it", async ($, on) => {
  const { cc, copied, toasts, closed } = await engine($, on)
  await messages($, ['ls'], ['cd /srv\nmake', 'pwd', 'whoami'])
  await cc()

  const ui = await $.ui.mount(pane())
  const two = (await rowButtons(ui)).find(button => button.props.hotkey === '2')
  await ui.press({ key: String(two?.key) })

  expect(copied).toEqual(['pwd'])
  expect(toasts).toEqual(['Copied #2: pwd'])
  expect(closed).toEqual(['cc'])
  await ui.unmount()
})

test('picking a multi-line row copies it whole', async ($, on) => {
  const { cc, copied, toasts } = await engine($, on)
  await messages($, ['ls', 'cd /srv/minecraft\nsudo systemctl restart minecraft'])
  await cc()

  const ui = await $.ui.mount(pane())
  await ui.press({ key: 'command:2' })

  expect(copied).toEqual(['cd /srv/minecraft\nsudo systemctl restart minecraft'])
  expect(toasts).toEqual(['Copied #2: cd /srv/minecraft'])
  await ui.unmount()
})

test('a copy from an older message copies that message\'s command', async ($, on) => {
  const { cc, copied } = await engine($, on)
  await messages($, ['old one', 'old two'], ['new'])
  await cc()

  const ui = await $.ui.mount(pane())
  await ui.press({ key: 'older' })
  await ui.press({ key: 'command:2' })
  expect(copied).toEqual(['old two'])
  await ui.unmount()
})

test('Enter in the filter copies the first match and closes the pane', async ($, on) => {
  const { cc, copied, closed } = await engine($, on)
  await messages($, ['echo a', 'yay -S piper', 'echo b'])
  await cc()

  const ui = await $.ui.mount(pane())
  await ui.input({ key: 'filter', text: 'piper', kind: 'change' })
  await ui.input({ key: 'filter', text: 'piper', kind: 'submit' })

  expect(copied).toEqual(['yay -S piper'])
  expect(closed).toEqual(['cc'])
  await ui.unmount()
})

test('a copy that fails still closes the pane and says why', async ($, on) => {
  const { cc, toasts, closed } = await engine($, on, { isCopied: false, reason: 'no-clipboard' })
  await messages($, ['ls'])
  await cc()

  const ui = await $.ui.mount(pane())
  await ui.press({ key: 'command:1' })
  expect(toasts).toEqual(['Could not copy #1 (no-clipboard).'])
  expect(closed).toEqual(['cc'])
  await ui.unmount()
})
