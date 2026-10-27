import { expect, test } from 'claude-code/testing'
import { engine, pane, reply } from './engine'

let id = 0
const fence = (command: string) => '```bash\n' + command + '\n```'
const prompt = ($: Parameters<typeof engine>[0]) => $.prompt.submit({ text: 'next', wait: false, origin: { kind: 'composer' } })

/** One message per entry: a prompt, then Claude's reply holding those commands in order. */
const messages = async ($: Parameters<typeof engine>[0], ...turns: string[][]) => {
  for (const commands of turns) {
    await prompt($)
    await $.session.append(reply(`m${++id}`,commands.map(fence).join('\nand\n') || 'prose only'))
  }
}

type Finder = { findAll: (q: { type: string }) => Promise<{ key?: string; props: Record<string, unknown> }[]> }
const rowButtons = async (ui: Finder) => (await ui.findAll({ type: 'Button' })).filter(button => String(button.key).startsWith('command:'))
const labels = async (ui: Finder) => (await rowButtons(ui)).map(row => row.props.label)

// T2: /cc opens a pane, not the band

test('/cc with no commands yet answers a notice and opens nothing', async ($, on) => {
  const { cc, opened } = await engine($, on)

  expect(await cc()).toBe('No shell commands yet: the register fills as Claude gives them.')
  expect(opened).toEqual([])
})

test('/cc opens a pane that takes the keys, closes on Esc, holds toasts and asks for 80 columns', async ($, on) => {
  const { cc, opened } = await engine($, on)
  await messages($, ['ls', 'pwd'])

  expect(await cc()).toBe('Command panel open: a digit or Enter copies a command, Esc closes it.')
  expect(opened).toHaveLength(1)
  expect(opened[0]).toMatchObject({ id: 'cc', title: 'Commands', focus: true, closeOnEscape: true, holdToasts: true, columns: 80 })
})

test('the pane asks for rows that fit its content, within a cap', async ($, on) => {
  const { cc, opened } = await engine($, on)
  await messages($, ['ls'])
  await cc()
  await messages($, Array.from({ length: 40 }, (_, n) => `echo ${n}`))
  await cc()

  const [few, many] = opened.map(args => args.rows ?? 0)
  expect(few).toBeGreaterThanOrEqual(8)
  expect(many).toBeGreaterThan(few!)
  expect(many).toBeLessThanOrEqual(30)
})

test('the pane opens on the latest message, its commands numbered from 1 in the order given', async ($, on) => {
  const { cc } = await engine($, on)
  await messages($, ['old'], ['first', 'second', 'third'])
  await cc()

  const ui = await $.ui.mount(pane())
  expect(await labels(ui)).toEqual(['first', 'second', 'third'])
  expect((await rowButtons(ui)).map(row => row.props.hotkey)).toEqual(['1', '2', '3'])
  await ui.unmount()
})

test('the header names the panel and counts only the messages that hold commands', async ($, on) => {
  const { cc } = await engine($, on)
  await messages($, ['a'], [], ['b'], [])
  await cc()

  const ui = await $.ui.mount(pane())
  expect((await ui.find({ type: 'Text', text: /Commands/ }))?.text).toContain('Commands')
  expect((await ui.find({ type: 'Text', text: /message 2 of 2/ }))?.text).toContain('message 2 of 2')
  await ui.unmount()
})

test('a multi-line command shows its first line and an ellipsis mark, a long one is cut to the width', async ($, on) => {
  const { cc } = await engine($, on)
  await messages($, ['cd /srv\nmake', 'x'.repeat(300)])
  await cc()

  const ui = await $.ui.mount(pane())
  const [multi, long] = await labels(ui)
  expect(multi).toBe('cd /srv …')
  expect(String(long).length).toBeLessThan(80)
  expect(String(long).endsWith('…')).toBe(true)
  await ui.unmount()
})

test('the first row is selected and the preview shows it whole; the ring moves both', async ($, on) => {
  const { cc } = await engine($, on)
  await messages($, ['cd /srv\nmake all', 'ls', 'pwd'])
  await cc()

  const ui = await $.ui.mount(pane())
  expect((await ui.find({ key: 'row:1' }))?.text).toContain('▶')
  const preview = (await ui.find({ key: 'preview' }))?.text ?? ''
  expect(preview).toContain('cd /srv')
  expect(preview).toContain('make all')

  await $.ui.focus({ component: 'Pane', requestId: 'cc', plugin: 'command-register', element: 'command:3', origin: { kind: 'person' } })
  expect((await ui.find({ key: 'row:3' }))?.text).toContain('▶')
  expect((await ui.find({ key: 'row:1' }))?.text).not.toContain('▶')
  expect((await ui.find({ key: 'preview' }))?.text).toContain('pwd')
  await ui.unmount()
})

test('the filter narrows the shown message only, and says so when nothing matches', async ($, on) => {
  const { cc } = await engine($, on)
  await messages($, ['yay -S piper'], ['echo a', 'yay -S piper-voices', 'echo b'])
  await cc()

  const ui = await $.ui.mount(pane())
  await ui.input({ key: 'filter', text: 'PIPER', kind: 'change' })
  expect(await labels(ui)).toEqual(['yay -S piper-voices'])
  await ui.input({ key: 'filter', text: 'zzz', kind: 'change' })
  expect(await rowButtons(ui)).toHaveLength(0)
  expect((await ui.find({ type: 'Text', text: /No command matches/ }))?.text).toContain('zzz')
  await ui.unmount()
})

test('the hint stays on one row of the pane width', async ($, on) => {
  const { cc } = await engine($, on)
  await messages($, ['ls'])
  await cc()

  const ui = await $.ui.mount(pane(30, 40))
  const hint = (await ui.find({ key: 'hint' }))?.text ?? ''
  expect(hint.length).toBeGreaterThan(0)
  expect(hint.length).toBeLessThanOrEqual(40)
  await ui.unmount()
})

test('the pane holds nothing once the register is cleared', async ($, on) => {
  const { cc } = await engine($, on)
  await messages($, ['ls'])
  await cc()
  await $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } })

  const ui = await $.ui.mount(pane())
  expect(await rowButtons(ui)).toHaveLength(0)
  expect((await ui.find({ type: 'Text', text: /No shell commands/ }))?.text).toContain('No shell commands')
  await ui.unmount()
})
