import { expect, mock, test } from 'claude-code/testing'

const FULLSCREEN = { columns: 200, rows: 50, isFullscreen: true }
const MAIN_SCREEN = { columns: 120, rows: 40, isFullscreen: false }

const reply = (text: string, extra: Record<string, unknown> = {}) => ({
  plugin: 'openskin',
  surface: 'terminal' as const,
  component: 'AssistantMessage' as const,
  requestId: 'msg-1',
  props: { text, isFirstOfReply: true },
  viewport: FULLSCREEN,
  ...extra,
})

const ONE = 'Run:\n\n```bash\nsudo pacman -Sc\n```\n'
const TWO = '```bash\nls -la\n```\n\nthen\n\n```sh\ndf -h /\ndu -sh .\n```\n'

const buttons = async (ui: { findAll: (q: { type: string }) => Promise<{ key?: unknown; text: string }[]> }) =>
  (await ui.findAll({ type: 'Button' })).filter(button => String(button.key).startsWith('copy:'))

/** Answers `$.ui.copy` (the kit has no clipboard) and records what was copied. */
const clipboard = (on: Parameters<Parameters<typeof test>[1]>[1], isCopied = true) => {
  const copies: string[] = []
  on('ui.copy', (_$, e) => {
    copies.push((e as { text: string }).text)
    return { value: isCopied ? { isCopied: true } : { isCopied: false, reason: 'no clipboard tool' } }
  })
  return copies
}

// --- T0: the engine accepts a Button in a transcript row ------------------------

test('a reply with a shell command draws a copy Button, and pressing it copies the command', async ($, on) => {
  const copies = clipboard(on)
  const ui = await $.ui.mount(reply(ONE))

  expect(await buttons(ui)).toHaveLength(1)
  await ui.press({ key: 'copy:command:1' })

  expect(copies).toEqual(['sudo pacman -Sc'])
  await ui.unmount()
})

// --- the button --------------------------------------------------------------

test('every command gets its own button with its own key, and copies the whole command', async ($, on) => {
  const copies = clipboard(on)
  const ui = await $.ui.mount(reply(TWO))

  const found = await buttons(ui)
  expect(found.map(button => button.key)).toEqual(['copy:command:0', 'copy:command:2'])

  await ui.press({ key: 'copy:command:2' })
  await ui.press({ key: 'copy:command:0' })
  expect(copies).toEqual(['df -h /\ndu -sh .', 'ls -la'])
  await ui.unmount()
})

test('the button is laid over the top border of the frame, at its right end', async $ => {
  const ui = await $.ui.mount(reply(ONE))

  const [button] = await buttons(ui)
  expect(button).toBeDefined()
  const boxes = await ui.findAll({ type: 'Box' })
  const overlay = boxes.find(box => box.props.position === 'absolute' && box.props.top === 0 && box.props.right !== undefined)
  expect(overlay).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '[copy]' })).toBeDefined()
  await ui.unmount()
})

test('the label turns into copied for 1.5 s after a copy, then goes back', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  clipboard(on)
  const ui = await $.ui.mount(reply(ONE))

  await ui.press({ key: 'copy:command:1' })
  expect(await ui.find({ type: 'Text', text: 'copied' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '[copy]' })).toBeUndefined()

  await clock.advance(1600)
  expect(await ui.find({ type: 'Text', text: '[copy]' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'copied' })).toBeUndefined()
  await ui.unmount()
})

test('a copy that fails toasts the reason and keeps the label', async ($, on) => {
  const toasts: string[] = []
  on('ui.toast', (_$, e) => {
    toasts.push((e as { text: string }).text)
    return { value: undefined }
  })
  clipboard(on, false)
  const ui = await $.ui.mount(reply(ONE))

  await ui.press({ key: 'copy:command:1' })

  expect(toasts).toHaveLength(1)
  expect(toasts[0]).toMatch(/no clipboard tool/)
  expect(await ui.find({ type: 'Text', text: '[copy]' })).toBeDefined()
  await ui.unmount()
})

// --- where clicks are reported ----------------------------------------------------

test('on the main screen, which reports no clicks, there is no button', async $ => {
  const ui = await $.ui.mount(reply(ONE, { viewport: MAIN_SCREEN }))

  expect(await buttons(ui)).toHaveLength(0)
  expect(await ui.find({ type: 'Code' })).toBeDefined()
  await ui.unmount()
})

test('a surface that does not say what layout it is drawn in gets the button', async $ => {
  const ui = await $.ui.mount(reply(ONE, { viewport: undefined }))

  expect(await buttons(ui)).toHaveLength(1)
  await ui.unmount()
})

test('with the OpenCode look off, commands framed in the engine transcript get the button too', { options: { opencodeStyle: false } }, async ($, on) => {
  const copies = clipboard(on)
  // The engine's own drawing of the prose pieces.
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const ui = await $.ui.mount(reply(ONE))

  expect(await buttons(ui)).toHaveLength(1)
  await ui.press({ key: 'copy:command:1' })
  expect(copies).toEqual(['sudo pacman -Sc'])
  await ui.unmount()
})
