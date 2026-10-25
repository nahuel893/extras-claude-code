/*
 * Ported from better-claude's context-meter:
 * https://github.com/midudev/better-claude/blob/main/plugins/context-meter/hooks/register.tsx
 * Copyright (c) 2026 Miguel Ángel Durán (midudev), MIT License (see ../../NOTICE).
 *
 * Changed for openskin: the meter is a card of the status panel instead of a line at
 * the right end of the band above the prompt, drawn as the status line's ten-cell bar in the
 * theme's colors; its thresholds are the `contextWarnAt` and `contextDangerAt` options, and its
 * atom lives under openskin's state.
 */
import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, SessionContextUsage, SessionMeasureInput, Timer } from 'claude-code'
import type { Fill } from '../../types'
import type { Section, Span } from '../statusline'
import type { Theme } from '../theme'

const SYNC_MS = 2000
const WARN_AT = 50
const DANGER_AT = 75
const CELLS = 10

const percent = atom({ plugin: 'openskin', key: 'contextFill' } as const, null as Fill)

/** The bar's color: the accent while there is room, yellow when it is time to /compact, the error color for a new session. */
export const contextColor = (value: number, warnAt: number, dangerAt: number, theme: Theme) =>
  value >= dangerAt ? theme.error : value >= warnAt ? 'warning' : theme.accent

/**
 * The status line's context bar: ten cells, the filled ones in the fill's color and the empty ones
 * muted, then "27%" ("~16%" for /context's estimate while the engine has no figure) and, when the
 * tokens are known, "(266921/1000000)".
 */
export const contextRow = (fill: NonNullable<Fill>, warnAt: number, dangerAt: number, theme: Theme): Span[] => {
  const filled = Math.round((Math.min(Math.max(fill.value, 0), 100) / 100) * CELLS)
  const tokens = fill.tokens !== undefined && fill.window !== undefined ? ` (${fill.tokens}/${fill.window})` : ''

  return [
    ...(filled > 0 ? [{ text: '█'.repeat(filled), color: contextColor(fill.value, warnAt, dangerAt, theme) }] : []),
    ...(filled < CELLS ? [{ text: '░'.repeat(CELLS - filled), color: theme.muted }] : []),
    { text: ` ${fill.isEstimate ? '~' : ''}${Math.round(fill.value)}%` },
    ...(tokens ? [{ text: tokens, color: theme.muted }] : []),
  ]
}

/** The fills where the meter turns yellow and red: the `contextWarnAt` and `contextDangerAt` options. */
export type Thresholds = { warnAt: number; dangerAt: number }

export const readThresholds = (options: PluginOptions): Thresholds => ({
  warnAt: typeof options.contextWarnAt === 'number' ? options.contextWarnAt : WARN_AT,
  dangerAt: typeof options.contextDangerAt === 'number' ? options.contextDangerAt : DANGER_AT,
})

// One count at a time: a check that comes while one runs leaves it be.
let isCounting = false
let lastFill: Fill = null
let timer: Timer | undefined

/** Writes the fill when it differs from the one shown (an equal write would redraw for nothing). */
async function show($: EngineInterface, next: Fill) {
  if (
    lastFill?.value === next?.value &&
    lastFill?.isEstimate === next?.isEstimate &&
    lastFill?.tokens === next?.tokens &&
    lastFill?.window === next?.window
  )
    return
  lastFill = next
  await update($, percent, () => next)
}

/**
 * Takes the engine's figure; while it has none (no response yet in this window: a fresh, resumed,
 * compacted or rewound session), counts the window once as /context does, and keeps that estimate
 * until the next response. `canCount` false only takes a figure (the start, which counting would hold up).
 */
async function sync($: EngineInterface, context: SessionContextUsage, canCount: boolean) {
  if (context.percent !== undefined) {
    const known = context.tokens === undefined ? {} : { tokens: context.tokens, window: context.window }
    return show($, { value: context.percent, isEstimate: false, ...known })
  }
  if (lastFill?.isEstimate || !canCount || isCounting) return

  isCounting = true
  try {
    const { breakdown } = (await $.session.usage({ breakdown: 'full' })).context
    await show(
      $,
      breakdown
        ? { value: breakdown.percentage, isEstimate: true, tokens: breakdown.totalTokens, window: breakdown.rawMaxTokens }
        : null,
    )
  } finally {
    isCounting = false
  }
}

/** At `session.start`: the first reading, then a check every two seconds. */
export async function startContextMeter($: EngineInterface) {
  timer?.cancel()
  isCounting = false
  lastFill = null
  await update($, percent, () => null)
  await sync($, (await $.session.usage()).context, false)
  // A resume or a rewind changes the fill without a measurement, so the meter reads the figure
  // again (the plain call is free) and counts when the engine has none.
  timer = $.clock.every(SYNC_MS, async () => {
    await sync($, (await $.session.usage()).context, true)
  })
}

/** At `session.end`. */
export const stopContextMeter = () => {
  timer?.cancel()
  timer = undefined
}

/** At `session.measure`: the figure of the response that moved it. */
export async function measureContext($: EngineInterface, e: SessionMeasureInput) {
  if (e.changed.includes('context')) await sync($, e.context, true)
}

/** The Context section of the panel; nothing while there is neither a figure nor an estimate. */
export async function contextSection($: EngineInterface, { warnAt, dangerAt }: Thresholds, theme: Theme): Promise<Section | null> {
  const fill = await read($, percent)
  if (fill === null) return null

  return { heading: '◔ Context', rows: [contextRow(fill, warnAt, dangerAt, theme)] }
}
