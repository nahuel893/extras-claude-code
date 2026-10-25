import { expect, test } from 'claude-code/testing'
import { createTracker, jump, targetAt, thumbCells, type Tracker } from '../hooks/scrollbar'

/** A transcript row's render event, as the hooks see it: its id and which of its rows the viewport shows. */
const row = (requestId: string, onScreen?: { first: number; last: number; of: number } | null) => ({
  requestId,
  props: { onScreen },
})

/** Four messages of ten rows each; the viewport shows b's rows 5-9 and c's rows 0-4 (rows 15-24 of 40). */
const midway = (): Tracker => {
  const tracker = createTracker()
  tracker.see(row('a', { first: 0, last: 9, of: 10 }))
  tracker.see(row('b', { first: 5, last: 9, of: 10 }))
  tracker.see(row('c', { first: 0, last: 4, of: 10 }))
  tracker.see(row('d', null))
  tracker.see(row('a', null))
  return tracker
}

// --- the thumb ---------------------------------------------------------------

test('the thumb covers the cells the viewport spans of the whole conversation', () => {
  expect(thumbCells(midway(), 10)).toEqual({ start: 3, end: 6 })
})

test('the thumb reaches the last cell when the viewport shows the end, the first when it shows the start', () => {
  const end = createTracker()
  end.see(row('a', null))
  end.see(row('b', { first: 0, last: 9, of: 10 }))
  expect(thumbCells(end, 10)).toEqual({ start: 5, end: 9 })

  const start = createTracker()
  start.see(row('a', { first: 0, last: 4, of: 10 }))
  start.see(row('b', null))
  expect(thumbCells(start, 10)).toEqual({ start: 0, end: 2 })
})

test('the thumb is at least one cell, however little the viewport shows', () => {
  const tracker = createTracker()
  tracker.see(row('a', null))
  tracker.see(row('b', { first: 0, last: 0, of: 1000 }))
  tracker.see(row('c', null))

  const thumb = thumbCells(tracker, 10)
  expect(thumb).not.toBeNull()
  expect(thumb!.end).toBeGreaterThanOrEqual(thumb!.start)
})

test('a message the viewport left (reported null) no longer holds the thumb', () => {
  const tracker = midway()
  tracker.see(row('b', null))
  tracker.see(row('c', { first: 0, last: 9, of: 10 }))
  tracker.see(row('d', { first: 0, last: 9, of: 10 }))

  expect(thumbCells(tracker, 8)).toEqual({ start: 4, end: 7 })
})

test('with nothing on screen or nothing seen there is no thumb', () => {
  expect(thumbCells(createTracker(), 10)).toBeNull()

  const tracker = createTracker()
  tracker.see(row('a', null))
  expect(thumbCells(tracker, 10)).toBeNull()
})

test('a surface that does not report the position (absent onScreen) changes nothing', () => {
  const tracker = createTracker()
  const before = tracker.version
  tracker.see(row('a'))
  expect(tracker.version).toBe(before)
  expect(thumbCells(tracker, 10)).toBeNull()
})

test('the version moves only when what the tracker knows changes', () => {
  const tracker = createTracker()
  tracker.see(row('a', { first: 0, last: 4, of: 10 }))
  const after = tracker.version
  tracker.see(row('a', { first: 0, last: 4, of: 10 }))
  expect(tracker.version).toBe(after)
  tracker.see(row('a', { first: 1, last: 5, of: 10 }))
  expect(tracker.version).toBeGreaterThan(after)
})

// --- the click ---------------------------------------------------------------

test('the top cell targets the first message, the bottom cell the latest at its end', () => {
  const tracker = midway()
  expect(targetAt(tracker, 0, 10)).toEqual({ id: 'a', block: 'start' })
  expect(targetAt(tracker, 9, 10)).toEqual({ id: 'd', block: 'end' })
})

test('a cell in between targets the message at that proportional height', () => {
  const tracker = midway()
  // Row 16 of 40 is b's; row 20 is c's; row 32 is d's.
  expect(targetAt(tracker, 4, 10)).toEqual({ id: 'b', block: 'start' })
  expect(targetAt(tracker, 5, 10)).toEqual({ id: 'c', block: 'start' })
  expect(targetAt(tracker, 8, 10)).toEqual({ id: 'd', block: 'start' })
})

test('messages never reported on screen weigh the mean of the known extents', () => {
  const tracker = createTracker()
  tracker.see(row('a', null))
  tracker.see(row('b', { first: 0, last: 29, of: 30 }))
  tracker.see(row('c', null))
  // 30 + 30 + 30 rows: cell 3 of 9 is row 30, the start of b.
  expect(targetAt(tracker, 3, 9)).toEqual({ id: 'b', block: 'start' })
  expect(targetAt(tracker, 2, 9)).toEqual({ id: 'a', block: 'start' })
})

test('a one-cell bar always means the end; an empty tracker has no target', () => {
  expect(targetAt(midway(), 0, 1)).toEqual({ id: 'd', block: 'end' })
  expect(targetAt(createTracker(), 3, 10)).toBeNull()
})

// --- the jump ----------------------------------------------------------------

type Scroll = { to: { requestId: string }; block?: string }

const fake = (answer: () => Promise<{ deny?: string }>) => {
  const scrolls: Scroll[] = []
  const toasts: string[] = []
  const $ = {
    ui: {
      scroll: async (args: Scroll) => {
        scrolls.push(args)
        return answer()
      },
      toast: (text: string) => void toasts.push(text),
    },
  }
  return { $, scrolls, toasts }
}

test('a click scrolls the transcript to the cell\'s message, its top at the window\'s top', async () => {
  const { $, scrolls, toasts } = fake(async () => ({}))

  await jump($ as never, midway(), 4, 10)

  expect(scrolls).toEqual([{ to: { requestId: 'b' }, block: 'start' }])
  expect(toasts).toEqual([])
})

test('the bottom cell scrolls the latest message to the window\'s end', async () => {
  const { $, scrolls } = fake(async () => ({}))

  await jump($ as never, midway(), 9, 10)

  expect(scrolls).toEqual([{ to: { requestId: 'd' }, block: 'end' }])
})

test('a refused scroll (a message the transcript no longer keeps drawn) toasts and does not throw', async () => {
  const { $, toasts } = fake(async () => ({ deny: 'not drawn' }))

  await jump($ as never, midway(), 0, 10)

  expect(toasts).toHaveLength(1)
  expect(toasts[0]).toMatch(/scroll/i)
})

test('a scroll that throws toasts too', async () => {
  const { $, toasts } = fake(async () => {
    throw new Error('gone')
  })

  await jump($ as never, midway(), 0, 10)

  expect(toasts).toHaveLength(1)
})

test('a click with no message known scrolls nothing', async () => {
  const { $, scrolls } = fake(async () => ({}))

  await jump($ as never, createTracker(), 3, 10)

  expect(scrolls).toEqual([])
})

// --- the panel's column ------------------------------------------------------

const PANE = {
  plugin: 'openskin',
  component: 'Pane' as const,
  requestId: 'openskin-status',
  surface: 'terminal' as const,
  props: {
    title: 'Status',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock' as const,
    scroll: { offset: 0, bodyRows: 12 },
    view: {},
  },
}

const prompt = (requestId: string, onScreen: { first: number; last: number; of: number } | null) => ({
  plugin: 'openskin',
  component: 'UserMessage' as const,
  requestId,
  surface: 'terminal' as const,
  props: { text: requestId, origin: { kind: 'composer' as const }, isExpanded: false, onScreen },
})

/** Four ten-row prompts drawn the way the transcript reports them: the viewport shows rows 15-24. */
const draw = async ($: Parameters<Parameters<typeof test>[1]>[0]) => {
  for (const [id, onScreen] of [
    ['a', null],
    ['b', { first: 5, last: 9, of: 10 }],
    ['c', { first: 0, last: 4, of: 10 }],
    ['d', null],
  ] as const) {
    const ui = await $.ui.mount(prompt(id, onScreen))
    await ui.unmount()
  }
}

test('the panel draws a one-column bar down its left edge, one Button per row of its body', async $ => {
  await draw($)
  const ui = await $.ui.mount(PANE)

  const cells = (await ui.findAll({ type: 'Button' })).filter(button => String(button.key).startsWith('scroll:'))
  expect(cells).toHaveLength(12)
  await ui.unmount()
})

test("the thumb cells are drawn in the theme's accent, the track in its muted color", async $ => {
  await draw($)
  const ui = await $.ui.mount(PANE)

  const glyphs = await ui.findAll({ type: 'Text', text: /^[█│]$/ })
  const thumb = glyphs.filter(glyph => glyph.props.color === '#f0a6ec')
  const track = glyphs.filter(glyph => glyph.props.color === '#7f7f8a')
  // Rows 15-24 of 40 over 12 cells: cells 4 to 7.
  expect(thumb).toHaveLength(4)
  expect(track).toHaveLength(8)
  await ui.unmount()
})

test('with the looks off the rows are still noted, and the engine\'s drawing and onScreen pass through unchanged', { options: { opencodeStyle: false, commandFrames: false } }, async ($, on) => {
  const seen: unknown[] = []
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    if (e.component === 'UserMessage') seen.push((e.props as { onScreen?: unknown }).onScreen)
    return <Text>engine</Text>
  })
  await draw($)
  const ui = await $.ui.mount(PANE)

  expect(seen).toContainEqual({ first: 5, last: 9, of: 10 })
  expect((await ui.findAll({ type: 'Text', text: /^█$/ })).length).toBe(4)
  await ui.unmount()
})

test('pressing a cell calls the scroll and, where the engine cannot scroll there, only toasts', async ($, on) => {
  // The test kit has no transcript to scroll: the call fails, which the bar answers with a toast
  // instead of throwing. Which message a cell names is in the jump tests above.
  const toasts: string[] = []
  on('ui.toast', (_$, e) => {
    toasts.push((e as { text: string }).text)
    return { value: undefined }
  })
  await draw($)
  const ui = await $.ui.mount(PANE)

  await ui.press({ key: 'scroll:0' })

  expect(toasts).toHaveLength(1)
  expect(toasts[0]).toMatch(/Could not scroll there/)
  await ui.unmount()
})
