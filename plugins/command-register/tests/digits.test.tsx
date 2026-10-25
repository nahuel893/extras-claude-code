import { expect, test } from 'claude-code/testing'
import { band, engine, reply } from './engine'

const fence = (command: string) => '```bash\n' + command + '\n```'

const rowLabels = async (ui: { findAll: (q: { type: string }) => Promise<{ props: Record<string, unknown> }[]> }) =>
  (await ui.findAll({ type: 'Button' })).map(button => button.props.label).filter(label => label !== 'close')

// T4: digit keys

test('each row carries its digit, 1 the newest, and 0 closes', async ($, on) => {
  const { cc } = await engine($, on)
  for (const n of [1, 2, 3]) await $.session.append(reply(`r${n}`, fence(`echo ${n}`)))
  await cc()

  const ui = await $.ui.mount(band())
  const buttons = await ui.findAll({ type: 'Button' })
  expect(buttons.map(button => [button.props.label, button.props.hotkey])).toEqual([
    ['echo 3', '1'],
    ['echo 2', '2'],
    ['echo 1', '3'],
    ['close', '0'],
  ])
  await ui.unmount()
})

test("pressing a row's digit copies that row's command and closes the list", async ($, on) => {
  const { cc, copied } = await engine($, on)
  for (const n of [1, 2, 3]) await $.session.append(reply(`r${n}`, fence(`echo ${n}`)))
  await cc()

  const ui = await $.ui.mount(band())
  // The kit presses a Button by its key, as its hotkey does: find the one the digit 2 arms.
  const two = (await ui.findAll({ type: 'Button' })).find(button => button.props.hotkey === '2')
  await ui.press({ key: String(two?.key) })

  expect(copied).toEqual(['echo 2'])
  expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)
  await ui.unmount()
})

test('past nine commands the list shows the nine newest and counts the rest in the title', async ($, on) => {
  const { cc } = await engine($, on)
  for (let n = 1; n <= 12; n++) await $.session.append(reply(`r${n}`, fence(`echo ${n}`)))
  await cc()

  const ui = await $.ui.mount(band(30))
  const rows = (await ui.findAll({ type: 'Button' })).filter(button => button.props.label !== 'close')
  expect(rows.map(button => button.props.hotkey)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9'])
  expect(rows[0]?.props.label).toBe('echo 12')
  expect(rows[8]?.props.label).toBe('echo 4')
  expect((await ui.find({ type: 'Text', text: /9 of 12/ }))?.text).toContain('9 of 12')
  await ui.unmount()
})

test('a short band shows only the rows it holds whole, so every shown digit is armed', async ($, on) => {
  const { cc } = await engine($, on)
  for (let n = 1; n <= 6; n++) await $.session.append(reply(`r${n}`, fence(`echo ${n}`)))
  await cc()

  // Nine rows of band: the frame, the filter, the preview and the hint leave three for commands.
  const ui = await $.ui.mount(band(9))
  expect(await rowLabels(ui)).toEqual(['echo 6', 'echo 5', 'echo 4'])
  await ui.unmount()
})
