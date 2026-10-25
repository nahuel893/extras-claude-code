/*
 * Ported from better-claude's sub-meter:
 * https://github.com/midudev/better-claude/blob/main/plugins/sub-meter/hooks/register.tsx
 * Copyright (c) 2026 Miguel Ángel Durán (midudev), MIT License (see ../../NOTICE).
 *
 * Changed for openskin: the meter is a section of the status panel, one row per window,
 * instead of a rotating entry in the prompt footer (so no rotation, display modes or hint
 * trimming), each row fitting the pane's width; its atoms live under openskin's state.
 */
import { atom, read, update } from 'claude-code'
import type { EngineInterface, SessionRateLimit } from 'claude-code'
import type { Limit } from '../../types'
import type { Section, Span } from '../statusline'

const limits = atom({ plugin: 'openskin', key: 'usageLimits' } as const, [] as Limit[])
const tick = atom({ plugin: 'openskin', key: 'usageTick' } as const, 0) // redraws the countdown

const WINDOWS = ['five_hour', 'seven_day']
const LABELS: Record<string, string> = { five_hour: '5h', seven_day: 'week' }
const TICK_MS = 8000
const CELLS = 10
const STORE_LIMITS = 'usageLimits'
const STORE_AT = 'usageAt'

/** The subscription windows the meter shows, in order, from what the engine measured. */
export const windowsOf = (rateLimits: readonly SessionRateLimit[]): Limit[] =>
  WINDOWS.flatMap(kind => {
    const found = rateLimits.find(limit => limit.kind === kind)
    return found ? [{ kind, percentUsed: found.percentUsed, resetsAt: found.resetsAt }] : []
  })

/** Columns a text takes: one per character, none for a variation selector. */
const widthOf = (text: string) => [...text.replace(/[︎️]/g, '')].length

/** Claude orange, yellow from 75%, red from 90%. */
export const usageColor = (percent: number) => (percent >= 90 ? 'error' : percent >= 75 ? 'warning' : 'claude')

/** "42m", "3h 5m", "2d 4h": how long until the window resets. */
export const until = (ms: number) => {
  const minutes = Math.max(1, Math.round(ms / 60000))
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ${minutes % 60}m`
  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}

const labelOf = (limit: Limit) => LABELS[limit.kind] ?? limit.kind

/**
 * One window as a row of `columns` at most: its label padded to `labelWidth`, a bar of ten
 * cells, the percentage used and the time until it resets. Where the row is short it gives up
 * the bar, then the reset time. A window past its reset reads 0%.
 */
export const usageRow = (limit: Limit, now: number, columns: number, labelWidth: number): Span[] => {
  const resetsIn = limit.resetsAt === undefined ? undefined : Date.parse(limit.resetsAt) - now
  const hasReset = resetsIn !== undefined && resetsIn <= 0
  const percent = hasReset ? 0 : limit.percentUsed
  const filled = Math.round((Math.min(Math.max(percent, 0), 100) / 100) * CELLS)
  const label = labelOf(limit).padEnd(labelWidth)
  const used = ` ${Math.round(percent)}%`
  const reset = resetsIn !== undefined && !hasReset ? ` ↻ ${until(resetsIn)}` : ''

  const short = widthOf(label + used)
  const fit = [
    { hasBar: true, hasReset: true, width: short + 1 + CELLS + widthOf(reset) },
    { hasBar: false, hasReset: true, width: short + widthOf(reset) },
  ].find(({ width }) => width <= columns) ?? { hasBar: false, hasReset: false }

  return [
    { text: label, dimColor: true },
    ...(fit.hasBar
      ? [
          { text: ' ' + '━'.repeat(filled), color: usageColor(percent) },
          { text: '─'.repeat(CELLS - filled), dimColor: true },
        ]
      : []),
    { text: used },
    ...(fit.hasReset && reset ? [{ text: reset, dimColor: true }] : []),
  ]
}

// When the reading this session shows was taken; the shared store carries the newest one of any session.
let seenAt = 0
let windowCount = 0
let tickTimer: { cancel: () => void } | undefined

/** Keeps the latest reading for the meter, and for the next session until a response reports again. */
async function remember($: EngineInterface, found: Limit[]) {
  if (found.length === 0) return
  seenAt = await $.clock.now()
  windowCount = found.length
  await update($, limits, () => found)
  await $.store.set(STORE_LIMITS, found)
  await $.store.set(STORE_AT, seenAt) // after the limits, so a reader that sees the new time finds the new limits
}

/** Adopts the reading another session left in the shared store, when it is newer than ours. */
async function syncFromStore($: EngineInterface) {
  const storedAt = Number(await $.store.get(STORE_AT)) || 0
  if (storedAt <= seenAt) return
  const saved = await $.store.get(STORE_LIMITS)
  if (!Array.isArray(saved)) return
  seenAt = storedAt
  windowCount = saved.length
  await update($, limits, () => saved as Limit[])
}

/**
 * At `session.start`: the last stored reading, then the session's own; in an interactive
 * session, a tick every eight seconds that adopts other sessions' readings and redraws the countdown.
 */
export async function startUsageMeter($: EngineInterface, isInteractive: boolean) {
  tickTimer?.cancel()
  tickTimer = undefined
  const [saved, storedAt, usage] = await Promise.all([
    $.store.get(STORE_LIMITS),
    $.store.get(STORE_AT),
    $.session.usage(),
  ])
  if (Array.isArray(saved)) {
    windowCount = saved.length
    await update($, limits, () => saved as Limit[])
  }
  seenAt = Number(storedAt) || 0

  await remember($, windowsOf(usage.rateLimits))

  if (isInteractive) {
    // Another session's reading shows up within TICK_MS of being stored.
    tickTimer = $.clock.every(TICK_MS, () => {
      void syncFromStore($).catch(() => {}) // a failed read keeps the reading on screen
      if (windowCount > 0) void update($, tick, n => n + 1)
    })
  }
}

/** At `session.end`. */
export const stopUsageMeter = () => {
  tickTimer?.cancel()
  tickTimer = undefined
}

/** At `session.measure`: the windows the response reported. */
export async function measureUsage($: EngineInterface, rateLimits: readonly SessionRateLimit[]) {
  await remember($, windowsOf(rateLimits))
}

/** The Usage section of the panel, its rows `columns` wide at most; nothing off a subscription. */
export async function usageSection($: EngineInterface, columns: number): Promise<Section | null> {
  const all = await read($, limits)
  if (all.length === 0) return null
  // Reading the tick subscribes the panel to the countdown.
  const [, now] = await Promise.all([read($, tick), $.clock.now()])
  const labelWidth = Math.max(...all.map(limit => widthOf(labelOf(limit))))

  return { heading: '◷ Usage', rows: all.map(limit => usageRow(limit, now, columns, labelWidth)) }
}
