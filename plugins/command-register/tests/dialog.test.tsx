import { expect, test } from 'claude-code/testing'
import { band, engine, reply } from './engine'

const fence = (command: string) => '```bash\n' + command + '\n```'

const fill = async ($: Parameters<typeof engine>[0], count: number, text = (n: number) => `echo ${n}`) => {
  for (let n = 1; n <= count; n++) await $.session.append(reply(`r${n}`, fence(text(n))))
}

const focusRow = (n: number) =>
  ({ component: 'AbovePrompt', requestId: 'above-prompt', plugin: 'command-register', element: `command:${n}`, origin: { kind: 'person' } }) as const

const rowButtons = async (ui: { findAll: (q: { type: string }) => Promise<{ key?: string; props: Record<string, unknown> }[]> }) =>
  (await ui.findAll({ type: 'Button' })).filter(button => String(button.key).startsWith('command:'))

// The dialog frame

test('the list is a rounded frame titled Commands with the shown count on the border', async ($, on) => {
  const { cc } = await engine($, on)
  await fill($, 12)
  await cc()

  const ui = await $.ui.mount(band(30))
  const frame = (await ui.findAll({ type: 'Box' })).find(box => box.props.borderStyle === 'round')
  expect(frame).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /Commands/ }))?.text).toContain('Commands')
  expect((await ui.find({ type: 'Text', text: /9 of 12/ }))?.text).toContain('9 of 12')
  await ui.unmount()
})

test('rows show the digit through the hotkey and the command, newest first, 9 at most', async ($, on) => {
  const { cc } = await engine($, on)
  await fill($, 12)
  await cc()

  const ui = await $.ui.mount(band(30))
  const rows = await rowButtons(ui)
  expect(rows.map(row => row.props.hotkey)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9'])
  expect(rows[0]?.props.label).toBe('echo 12')
  expect(rows[8]?.props.label).toBe('echo 4')
  await ui.unmount()
})

test('a multi-line command shows its first line and an ellipsis mark', async ($, on) => {
  const { cc } = await engine($, on)
  await fill($, 1, () => 'cd /srv\nmake')
  await cc()

  const ui = await $.ui.mount(band())
  expect((await rowButtons(ui))[0]?.props.label).toBe('cd /srv …')
  await ui.unmount()
})

test('a long command is cut to the band width with an ellipsis', async ($, on) => {
  const { cc } = await engine($, on)
  await fill($, 1, () => 'x'.repeat(300))
  await cc()

  const ui = await $.ui.mount(band())
  const label = String((await rowButtons(ui))[0]?.props.label)
  expect(label.length).toBeLessThan(100)
  expect(label.endsWith('…')).toBe(true)
  await ui.unmount()
})

// Selection and preview

test('unfocused, the first row is selected and the preview shows it whole', async ($, on) => {
  const { cc } = await engine($, on)
  await fill($, 2, n => (n === 2 ? 'cd /srv\nmake all' : 'ls'))
  await cc()

  const ui = await $.ui.mount(band())
  expect((await ui.find({ key: 'row:2' }))?.text).toContain('▶')
  expect((await ui.find({ key: 'row:1' }))?.text).not.toContain('▶')
  const preview = (await ui.find({ key: 'preview' }))?.text ?? ''
  expect(preview).toContain('cd /srv')
  expect(preview).toContain('make all')
  await ui.unmount()
})

test('the marker and the preview follow the ring onto another row', async ($, on) => {
  const { cc } = await engine($, on)
  await fill($, 3)
  await cc()

  const ui = await $.ui.mount(band())
  await $.ui.focus(focusRow(2))
  expect((await ui.find({ key: 'row:2' }))?.text).toContain('▶')
  expect((await ui.find({ key: 'row:3' }))?.text).not.toContain('▶')
  expect((await ui.find({ key: 'preview' }))?.text).toContain('echo 2')
  await ui.unmount()
})

test('a preview of a long command is wrapped to the width', async ($, on) => {
  const { cc } = await engine($, on)
  await fill($, 1, () => 'a'.repeat(250))
  await cc()

  const ui = await $.ui.mount(band())
  const lines = (await ui.findAll({ type: 'Text' })).filter(line => /^a+$/.test(line.text))
  expect(lines.length).toBeGreaterThan(1)
  for (const line of lines) expect(line.text.length).toBeLessThanOrEqual(100)
  await ui.unmount()
})

// The hint

test('the hint depends on whether the band holds the keyboard', async ($, on) => {
  const { cc } = await engine($, on)
  await fill($, 2)
  await cc()

  const ui = await $.ui.mount(band())
  expect((await ui.find({ key: 'hint' }))?.text).toContain('ctrl+x tab to browse')
  await $.ui.focus(focusRow(1))
  const focused = (await ui.find({ key: 'hint' }))?.text ?? ''
  expect(focused).toContain('esc back')
  expect(focused).toContain('enter copy')
  await ui.unmount()
})

test('the hint is one row, shortened in a narrow band', async ($, on) => {
  const { cc } = await engine($, on)
  await fill($, 2)
  await cc()

  const narrow = band()
  const ui = await $.ui.mount({ ...narrow, props: { ...narrow.props, bodyColumns: 40 } })
  const hint = (await ui.find({ key: 'hint' }))?.text ?? ''
  expect(hint.length).toBeLessThanOrEqual(40 - 4)
  await ui.unmount()
})

// Filter

test('typing in the filter narrows the rows and the count', async ($, on) => {
  const { cc } = await engine($, on)
  await fill($, 3, n => (n === 2 ? 'yay -S piper' : `echo ${n}`))
  await cc()

  const ui = await $.ui.mount(band())
  await ui.input({ key: 'filter', text: 'PIPER', kind: 'change' })
  expect((await rowButtons(ui)).map(row => row.props.label)).toEqual(['yay -S piper'])
  expect((await ui.find({ type: 'Text', text: /1 of 3/ }))?.text).toContain('1 of 3')
  await ui.unmount()
})

test('a filter that matches nothing says so and keeps the digits unarmed', async ($, on) => {
  const { cc } = await engine($, on)
  await fill($, 2)
  await cc()

  const ui = await $.ui.mount(band())
  await ui.input({ key: 'filter', text: 'zzz', kind: 'change' })
  expect(await rowButtons(ui)).toHaveLength(0)
  expect((await ui.find({ type: 'Text', text: /No command matches/ }))?.text).toContain('zzz')
  await ui.unmount()
})

test('Enter in the filter copies the selected row and closes the list', async ($, on) => {
  const { cc, copied } = await engine($, on)
  await fill($, 3, n => (n === 2 ? 'yay -S piper' : `echo ${n}`))
  await cc()

  const ui = await $.ui.mount(band())
  await ui.input({ key: 'filter', text: 'piper', kind: 'change' })
  await ui.input({ key: 'filter', text: 'piper', kind: 'submit' })
  expect(copied).toEqual(['yay -S piper'])
  expect(await rowButtons(ui)).toHaveLength(0)
  await ui.unmount()
})

test('a digit copies the row of the filtered list it labels', async ($, on) => {
  const { cc, copied } = await engine($, on)
  await fill($, 3, n => (n === 2 ? 'yay -S piper' : `echo ${n}`))
  await cc()

  const ui = await $.ui.mount(band())
  await ui.input({ key: 'filter', text: 'piper', kind: 'change' })
  await ui.press({ key: 'command:2' })
  expect(copied).toEqual(['yay -S piper'])
  await ui.unmount()
})

test('opening /cc again starts with no filter and no focus', async ($, on) => {
  const { cc } = await engine($, on)
  await fill($, 3)
  await cc()
  const first = await $.ui.mount(band())
  await first.input({ key: 'filter', text: 'echo 1', kind: 'change' })
  await $.ui.focus(focusRow(1))
  await first.unmount()

  await $.prompt.submit({ text: 'x', wait: false, origin: { kind: 'composer' } })
  await cc()
  const ui = await $.ui.mount(band())
  expect(await rowButtons(ui)).toHaveLength(3)
  expect((await ui.find({ key: 'hint' }))?.text).toContain('ctrl+x tab to browse')
  await ui.unmount()
})

test('a short band keeps the frame whole by showing fewer rows', async ($, on) => {
  const { cc } = await engine($, on)
  await fill($, 9)
  await cc()

  const ui = await $.ui.mount(band(10))
  const shown = (await rowButtons(ui)).length
  expect(shown).toBeGreaterThanOrEqual(1)
  expect(shown).toBeLessThan(9)
  await ui.unmount()
})
