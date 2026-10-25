import type { Elements, EngineInterface, On } from 'claude-code'
import type { Theme } from './theme'

/**
 * A scrollbar for the transcript, drawn down the left edge of the status panel. The transcript's
 * rows report which of their rows the viewport shows (`onScreen`) as they draw and again at a
 * scroll, for the messages at the viewport's edges; the Tracker keeps those reports and the
 * order the rows were first seen in, which is the conversation's order. From them come the
 * thumb (which cells the viewport spans) and, for a click on a cell, the message at that height.
 */

/** Which of a message's rows the viewport shows, and the message's whole extent (the engine's `OnScreen`). */
type Seen = { first: number; last: number; of: number }

/** What the tracker reads of a transcript row's render event. */
type RowEvent = { requestId: string; props: { onScreen?: Seen | null } }

export type Tracker = {
  /** The messages in the order they were first drawn. */
  order: string[]
  /** Each message's place in `order`. */
  index: Map<string, number>
  /** The whole extent of each message the viewport has shown. */
  extent: Map<string, number>
  /** The messages the viewport shows now. */
  shown: Map<string, Seen>
  /** Moves whenever a report changes what the tracker knows, so a timer can tell the panel to draw again. */
  version: number
  /** Notes one row's report. A row that does not say where the viewport is (no `onScreen`) changes nothing. */
  see: (e: RowEvent) => void
}

export const createTracker = (): Tracker => {
  const tracker: Tracker = {
    order: [],
    index: new Map(),
    extent: new Map(),
    shown: new Map(),
    version: 0,
    see: ({ requestId, props: { onScreen } }) => {
      if (onScreen === undefined) return
      if (!tracker.index.has(requestId)) {
        tracker.index.set(requestId, tracker.order.length)
        tracker.order.push(requestId)
        tracker.version++
      }
      if (onScreen === null) {
        if (tracker.shown.delete(requestId)) tracker.version++
        return
      }
      const before = tracker.shown.get(requestId)
      if (before && before.first === onScreen.first && before.last === onScreen.last && before.of === onScreen.of) return
      tracker.shown.set(requestId, { first: onScreen.first, last: onScreen.last, of: onScreen.of })
      tracker.extent.set(requestId, onScreen.of)
      tracker.version++
    },
  }
  return tracker
}

/**
 * Every message's rows laid end to end: `prefix[i]` is where message i starts, `total` where the
 * last ends. A message never drawn inside the viewport has no known extent: it weighs the mean of
 * the known ones.
 */
const layout = (tracker: Tracker) => {
  const { extent } = tracker
  const known = [...extent.values()]
  const mean = known.length ? known.reduce((sum, rows) => sum + rows, 0) / known.length : 1
  const prefix: number[] = []
  let total = 0
  for (const id of tracker.order) {
    prefix.push(total)
    total += extent.get(id) ?? mean
  }
  return { prefix, total }
}

/** The cells (first and last, inclusive) the viewport spans out of `cells`, at least one; null with no viewport known. */
export const thumbCells = (tracker: Tracker, cells: number): { start: number; end: number } | null => {
  if (cells < 1 || tracker.shown.size === 0) return null

  const { index } = tracker
  const { prefix, total } = layout(tracker)
  let top = Infinity
  let bottom = -Infinity
  for (const [id, seen] of tracker.shown) {
    const at = index.get(id)
    if (at === undefined) continue
    top = Math.min(top, prefix[at]! + seen.first)
    bottom = Math.max(bottom, prefix[at]! + seen.last + 1)
  }
  if (!Number.isFinite(top) || total <= 0) return null

  const start = Math.min(cells - 1, Math.max(0, Math.floor((top * cells) / total)))
  const end = Math.min(cells - 1, Math.max(start, Math.ceil((bottom * cells) / total) - 1))
  return { start, end }
}

/**
 * Where a click on cell `cell` of `cells` goes: the message at that proportional height, its top
 * at the window's top; the bottom cell the latest message, its end at the window's end. Null with
 * no message known.
 */
export const targetAt = (
  tracker: Tracker,
  cell: number,
  cells: number,
): { id: string; block: 'start' | 'end' } | null => {
  const last = tracker.order[tracker.order.length - 1]
  if (last === undefined) return null
  if (cell >= cells - 1) return { id: last, block: 'end' }

  const { prefix, total } = layout(tracker)
  const row = Math.floor((Math.max(0, cell) * total) / cells)
  let at = 0
  while (at + 1 < prefix.length && prefix[at + 1]! <= row) at++
  return { id: tracker.order[at]!, block: 'start' }
}

const refused = (why?: string) =>
  `Could not scroll there${why ? ` (${why})` : ''}: that part of the conversation may not be drawn. Scroll closer first.`

/**
 * (A function declaration: the engine follows `$` past an import only into one.)
 * Scrolls the transcript to the message under a clicked cell. A row of the transcript moves only
 * while the call answers the person's own input, which a Button's press is. A message too far back
 * to still be drawn is refused: the person gets a toast, and nothing else happens.
 */
export async function jump($: Pick<EngineInterface, 'ui'>, tracker: Tracker, cell: number, cells: number) {
  const target = targetAt(tracker, cell, cells)
  if (!target) return

  try {
    const { deny } = await $.ui.scroll({ to: { requestId: target.id }, block: target.block })
    if (deny) $.ui.toast(refused(deny))
  } catch {
    $.ui.toast(refused())
  }
}

export type ScrollbarUi = Pick<Elements['terminal'], 'Box' | 'Button' | 'Text'>

/**
 * The bar: one Button per cell, the thumb in the theme's accent, the track in its muted color. A
 * click on any cell jumps there. Like the panel it sits in, it is as tall as the pane's body.
 */
export function drawScrollbar(
  { Box, Button, Text }: ScrollbarUi,
  $: Pick<EngineInterface, 'ui'>,
  tracker: Tracker,
  cells: number,
  theme: Theme,
) {
  const thumb = thumbCells(tracker, cells)

  return (
    <Box flexDirection="column" width={1} flexShrink={0}>
      {Array.from({ length: cells }, (_, i) => {
        const isThumb = thumb !== null && i >= thumb.start && i <= thumb.end
        return (
          <Button key={`scroll:${i}`} plain onPress={() => jump($, tracker, i, cells)}>
            <Text color={isThumb ? theme.accent : theme.muted}>{isThumb ? '█' : '│'}</Text>
          </Button>
        )
      })}
    </Box>
  )
}

/** The transcript's components that report `onScreen` and are worth a place on the bar. */
export const TRACKED = ['UserMessage', 'AssistantMessage', 'ToolUse', 'ToolGroup', 'CommandOutput'] as const

/** Hooks that only note the position of the rows no other openskin hook owns (`skip` names those). */
export const trackRows = (on: On, tracker: Tracker, skip: readonly string[]) => {
  for (const component of TRACKED) {
    if (skip.includes(component)) continue
    on('ui.render', { component }, async ($, e, next) => {
      tracker.see(e as RowEvent)
      return next(e)
    })
  }
}
