import { expect, test } from 'claude-code/testing'
import { band, engine, reply } from './engine'

const fence = (command: string) => '```bash\n' + command + '\n```'

const rowLabels = async (ui: { findAll: (q: { type: string }) => Promise<{ props: Record<string, unknown> }[]> }) =>
  (await ui.findAll({ type: 'Button' })).map(button => button.props.label).filter(label => label !== 'close')

// T2: /cc alone

test('/cc with no commands yet answers a notice and opens nothing', async ($, on) => {
  const { cc } = await engine($, on)

  expect(await cc()).toBe('No shell commands yet: the register fills as Claude gives them.')

  const ui = await $.ui.mount(band())
  expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)
  expect((await ui.find({ type: 'Text', text: /^engine$/ }))?.text).toBe('engine')
  await ui.unmount()
})

test('/cc opens the list above the prompt, the band left to the engine until then', async ($, on) => {
  const { cc } = await engine($, on)
  await $.session.append(reply('r1', fence('ls')))

  const before = await $.ui.mount(band())
  expect(await before.findAll({ type: 'Button' })).toHaveLength(0)
  await before.unmount()

  expect(await cc()).toBe('Command list open above the prompt: press a row\'s digit to copy it.')

  const ui = await $.ui.mount(band())
  expect(await rowLabels(ui)).toEqual(['#1  ls'])
  await ui.unmount()
})

// T3: the list

test('rows read #n and the first line, newest first, above what the engine draws', async ($, on) => {
  const { cc } = await engine($, on)
  await $.session.append(reply('r1', fence('ls')))
  await $.session.append(reply('r2', fence('cd /srv/minecraft\nsudo systemctl restart minecraft')))
  await $.session.append(reply('r3', fence('pwd')))
  await cc()

  const ui = await $.ui.mount(band())
  expect(await rowLabels(ui)).toEqual(['#3  pwd', '#2  cd /srv/minecraft …', '#1  ls'])
  expect((await ui.find({ type: 'Text', text: /^engine$/ }))?.text).toBe('engine')
  await ui.unmount()
})

test('picking a row copies that command whole and closes the list', async ($, on) => {
  const { cc, copied, toasts } = await engine($, on)
  await $.session.append(reply('r1', fence('ls')))
  await $.session.append(reply('r2', fence('cd /srv/minecraft\nsudo systemctl restart minecraft')))
  await cc()

  const ui = await $.ui.mount(band())
  await ui.press({ key: 'command:2' })

  expect(copied).toEqual(['cd /srv/minecraft\nsudo systemctl restart minecraft'])
  expect(toasts).toEqual(['Copied #2: cd /srv/minecraft'])
  expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)
  expect((await ui.find({ type: 'Text', text: /^engine$/ }))?.text).toBe('engine')
  await ui.unmount()
})

test('close shuts the list without copying', async ($, on) => {
  const { cc, copied } = await engine($, on)
  await $.session.append(reply('r1', fence('ls')))
  await cc()

  const ui = await $.ui.mount(band())
  await ui.press({ key: 'close' })

  expect(copied).toEqual([])
  expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)
  await ui.unmount()
})

test('the next prompt closes the list: Esc gives the band no signal, so returning to the prompt does', async ($, on) => {
  const { cc } = await engine($, on)
  await $.session.append(reply('r1', fence('ls')))
  await cc()
  await $.prompt.submit({ text: 'thanks', wait: false, origin: { kind: 'composer' } })

  const ui = await $.ui.mount(band())
  expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)
  await ui.unmount()
})

test('a survey keeps the band: the list waits and its digits do not clash', async ($, on) => {
  const { cc } = await engine($, on)
  await $.session.append(reply('r1', fence('ls')))
  await cc()

  const survey = band()
  const ui = await $.ui.mount({ ...survey, props: { ...survey.props, hasSurvey: true } })
  expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)
  await ui.unmount()
})
