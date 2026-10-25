import { expect, test } from 'claude-code/testing'

const SURFACES = ['terminal', 'desktop'] as const

type Found = { props: Record<string, unknown>; text: string }
type Drawing = {
  find: (q: { type?: string; text?: string | RegExp }) => Promise<Found | undefined>
  findAll: (q: { type?: string; text?: string | RegExp }) => Promise<Found[]>
}

const message = (text: string, extra: { isSummary?: true } = {}) => ({
  plugin: 'openskin',
  component: 'AssistantMessage' as const,
  requestId: 'msg-1',
  props: { text, isFirstOfReply: true, ...extra },
})

const backgrounds = async (ui: Drawing) =>
  (await ui.findAll({ type: 'Box' })).map(box => box.props.backgroundColor).filter(Boolean)

const REPLIES = ['No commands here.', 'Run this:\n\n```bash\nsudo pacman -Sc\n```\n\nThen tell me.']

/**
 * The band's shape: the blocks' side gutters outside it, a row clear above it, a row of
 * air inside at top and bottom, and its text starting at column 5 like a block's.
 */
const BAND = {
  flexDirection: 'column',
  marginX: 2,
  marginTop: 1,
  paddingLeft: 3,
  paddingRight: 2,
  paddingY: 1,
  gap: 1,
}

test('a reply is drawn on a band of the default background, with the blocks\' side gutters, on every surface', async $ => {
  for (const surface of SURFACES) {
    for (const text of REPLIES) {
      const ui = await $.ui.mount({ ...message(text), surface })
      const band = await ui.find({ type: 'Box' })

      expect(band?.props).toMatchObject({ ...BAND, backgroundColor: '#1c1c22' })
      expect(band?.props.paddingLeft).toBe(5 - 2)
      expect(band?.props.marginBottom).toBeUndefined()
      expect(band?.props.marginY).toBeUndefined()
      // Only the band paints: the command frame inside it stays transparent.
      expect(await backgrounds(ui)).toEqual(['#1c1c22'])
      await ui.unmount()
    }
  }
})

test('the reply background comes from the mod options, trimmed', { options: { background: '  #101014  ' } }, async $ => {
  const ui = await $.ui.mount({ ...message(REPLIES[0]!), surface: 'terminal' })

  expect((await ui.find({ type: 'Box' }))?.props).toMatchObject({ ...BAND, backgroundColor: '#101014' })
  await ui.unmount()
})

test('a blank reply background falls back to the default', { options: { background: '   ' } }, async $ => {
  const ui = await $.ui.mount({ ...message(REPLIES[0]!), surface: 'terminal' })

  expect((await ui.find({ type: 'Box' }))?.props.backgroundColor).toBe('#1c1c22')
  await ui.unmount()
})

test('a reply background of "none" paints nothing but keeps the band\'s layout', { options: { background: 'none' } }, async $ => {
  for (const surface of SURFACES) {
    for (const text of REPLIES) {
      const ui = await $.ui.mount({ ...message(text), surface })
      const band = await ui.find({ type: 'Box' })

      expect(band?.props).toMatchObject(BAND)
      expect(band?.props.backgroundColor).toBeUndefined()
      expect(await backgrounds(ui)).toEqual([])
      await ui.unmount()
    }
  }
})

test('a summary row gets no band', { options: { background: '#101014' } }, async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  const ui = await $.ui.mount({ ...message('A summary.', { isSummary: true }), surface: 'terminal' })

  expect(await backgrounds(ui)).toEqual([])
  expect((await ui.find({ type: 'Box' }))?.props.paddingLeft).toBe(3)
  await ui.unmount()
})

test(
  'with opencodeStyle off, framed commands get no background',
  { options: { opencodeStyle: false, background: '#101014' } },
  async ($, on) => {
    on('ui.render', ($, e) => {
      const { Text } = $.ui.resolve(e)

      return <Text>engine</Text>
    })

    const ui = await $.ui.mount({ ...message(REPLIES[1]!), surface: 'terminal' })

    expect(await ui.find({ type: 'Code' })).toBeDefined()
    expect(await backgrounds(ui)).toEqual([])
    await ui.unmount()
  },
)
