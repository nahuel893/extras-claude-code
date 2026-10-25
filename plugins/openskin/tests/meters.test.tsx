/*
 * The fixtures and worlds here are adapted from better-claude's meter tests:
 * https://github.com/midudev/better-claude/blob/main/plugins/token-meter/hooks/register.test.tsx
 * https://github.com/midudev/better-claude/blob/main/plugins/context-meter/hooks/register.test.tsx
 * https://github.com/midudev/better-claude/blob/main/plugins/sub-meter/hooks/register.test.tsx
 * Copyright (c) 2026 Miguel Ángel Durán (midudev), MIT License (see ../NOTICE).
 */
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, SessionContextUsage, SessionRateLimit } from 'claude-code'
import { contextColor, contextRow } from '../hooks/meters/context'
import { THEME_DEFAULTS } from '../hooks/theme'
import { addTokens, short, tokenRows, tokensOf } from '../hooks/meters/tokens'
import { until, usageColor, usageRow, windowsOf } from '../hooks/meters/usage'

const NOW = Date.parse('2026-10-12T10:00:00Z')
const HOUR = 3_600_000
const at = (ms: number) => new Date(NOW + ms).toISOString()
const LIMITS: SessionRateLimit[] = [
  { kind: 'five_hour', percentUsed: 58, resetsAt: at(2 * HOUR + 10 * 60_000) },
  { kind: 'seven_day', percentUsed: 23.5, resetsAt: at(76 * HOUR) },
]
const WINDOW = 200_000
const fill = (percent?: number): SessionContextUsage =>
  percent === undefined ? { window: WINDOW } : { window: WINDOW, tokens: (WINDOW * percent) / 100, percent }
const USAGE = {
  input_tokens: 1200,
  output_tokens: 340,
  cache_read_input_tokens: 4100,
  cache_creation_input_tokens: 0,
  model: 'claude-opus-5-5',
}

const PANE = {
  plugin: 'openskin',
  component: 'Pane',
  requestId: 'openskin-status',
  surface: 'terminal',
  props: {
    title: 'Status',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

// --- Tokens -------------------------------------------------------------------

test('token counts read as thousands from 1000 up, one decimal', async () => {
  expect(short(0)).toBe('0')
  expect(short(999)).toBe('999')
  expect(short(1200)).toBe('1.2k')
  expect(short(40_000)).toBe('40.0k')
})

test("a turn's usage counts cache reads and writes together, and adds up over the session", async () => {
  const turn = tokensOf({ ...USAGE, cache_creation_input_tokens: 900 })
  expect(turn).toEqual({ input: 1200, output: 340, cached: 5000 })
  expect(addTokens(turn, { input: 800, output: 60, cached: 0 })).toEqual({ input: 2000, output: 400, cached: 5000 })
})

test('the tokens section: the turn in color, the session total dim', async () => {
  const rows = tokenRows({ input: 1200, output: 340, cached: 4100 }, { input: 2000, output: 400, cached: 4100 })
  expect(rows).toEqual([
    [
      { text: '↑', color: 'suggestion' },
      { text: ' 1.2k  ' },
      { text: '↓', color: 'success' },
      { text: ' 340  ' },
      { text: 'cache', color: 'claude' },
      { text: ' 4.1k' },
    ],
    [{ text: 'session ↑ 2.0k  ↓ 400', dimColor: true }],
  ])
})

// --- Context ------------------------------------------------------------------

const T = THEME_DEFAULTS

test('the context bar is the accent under 50%, yellow from 50%, the error color from 75%', async () => {
  expect(contextColor(49.9, 50, 75, T)).toBe(T.accent)
  expect(contextColor(50, 50, 75, T)).toBe('warning')
  expect(contextColor(74, 50, 75, T)).toBe('warning')
  expect(contextColor(75, 50, 75, T)).toBe(T.error)
  expect(contextColor(40, 30, 60, T)).toBe('warning')
})

test('the context row: a ten-cell bar, the rounded fill, then the tokens over the window', async () => {
  expect(contextRow({ value: 26.7, isEstimate: false, tokens: 266921, window: 1000000 }, 50, 75, T)).toEqual([
    { text: '███', color: T.accent },
    { text: '░░░░░░░', color: T.muted },
    { text: ' 27%' },
    { text: ' (266921/1000000)', color: T.muted },
  ])
  expect(contextRow({ value: 82, isEstimate: false }, 50, 75, T)).toEqual([
    { text: '████████', color: T.error },
    { text: '░░', color: T.muted },
    { text: ' 82%' },
  ])
})

test('an estimate is marked with ~, and an empty or full window draws no empty run', async () => {
  expect(contextRow({ value: 16, isEstimate: true }, 50, 75, T).map(span => span.text)).toEqual(['██', '░░░░░░░░', ' ~16%'])
  expect(contextRow({ value: 0, isEstimate: false }, 50, 75, T).map(span => span.text)).toEqual(['░░░░░░░░░░', ' 0%'])
  expect(contextRow({ value: 120, isEstimate: false }, 50, 75, T).map(span => span.text)).toEqual(['██████████', ' 120%'])
})

// --- Usage --------------------------------------------------------------------

test('the time until a window resets: minutes, hours and minutes, days and hours', async () => {
  expect(until(10_000)).toBe('1m')
  expect(until(42 * 60_000)).toBe('42m')
  expect(until(3 * HOUR + 5 * 60_000)).toBe('3h 5m')
  expect(until(52 * HOUR)).toBe('2d 4h')
})

test('a window is the theme accent, yellow from 75%, the theme error color from 90%', async () => {
  expect(usageColor(74, T)).toBe(T.accent)
  expect(usageColor(75, T)).toBe('warning')
  expect(usageColor(90, T)).toBe(T.error)
})

test('only the 5-hour and weekly windows count, in that order', async () => {
  const found = windowsOf([{ kind: 'spend_limit', percentUsed: 10 }, LIMITS[1]!, LIMITS[0]!])
  expect(found.map(limit => limit.kind)).toEqual(['five_hour', 'seven_day'])
})

test('a usage row: label, a bar of ten cells, the percentage and the time to reset', async () => {
  expect(usageRow(LIMITS[0]!, NOW, 40, 4, T)).toEqual([
    { text: '5h  ', dimColor: true },
    { text: ' ━━━━━━', color: T.accent },
    { text: '────', color: T.muted },
    { text: ' 58%' },
    { text: ' ↻ 2h 10m', dimColor: true },
  ])
  expect(usageRow(LIMITS[1]!, NOW, 40, 4, T).map(span => span.text)).toEqual(['week', ' ━━', '────────', ' 24%', ' ↻ 3d 4h'])
})

test('a narrow row gives up its bar first, then the reset time', async () => {
  expect(usageRow(LIMITS[0]!, NOW, 20, 4, T).map(span => span.text)).toEqual(['5h  ', ' 58%', ' ↻ 2h 10m'])
  expect(usageRow(LIMITS[0]!, NOW, 10, 4, T).map(span => span.text)).toEqual(['5h  ', ' 58%'])
})

test('a window past its reset reads 0% with no countdown', async () => {
  expect(usageRow({ ...LIMITS[0]!, resetsAt: at(-1000) }, NOW, 40, 4, T).map(span => span.text)).toEqual([
    '5h  ',
    ' ',
    '──────────',
    ' 0%',
  ])
})

// --- The sections in the panel ------------------------------------------------

/** Everything beneath the mod: clock, store, the session's usage, turns, and no status line yet. */
function world(on: On, context: SessionContextUsage = fill(), rateLimits: SessionRateLimit[] = LIMITS) {
  const live = { context, rateLimits, estimate: null as number | null }
  const clock = mock.clock(on, { now: NOW })
  const store: Record<string, unknown> = {}
  on('store.get', ($, e) => ({ value: store[e.key] }))
  on('store.set', ($, e) => {
    store[e.key] = JSON.parse(JSON.stringify(e.value))
    return { value: undefined }
  })
  on('env.get', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'panel' } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', ($, e) => {
    const breakdown =
      e.breakdown !== undefined && live.estimate !== null
        ? { percentage: live.estimate, totalTokens: live.estimate * 2000, rawMaxTokens: WINDOW }
        : undefined
    return { value: { startedAt: NOW, context: { ...live.context, breakdown }, rateLimits: live.rateLimits } as never }
  })
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  return { live, clock, store }
}

const startSession = ($: Engine) => $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: true })
const turnEnd = ($: Engine, usage?: typeof USAGE) =>
  $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer', usage })
const measure = ($: Engine, percent?: number, rateLimits: SessionRateLimit[] = []) =>
  $.session.measure({ context: fill(percent), rateLimits, changed: ['context'] })
const mountPane = ($: Engine) => $.ui.mount(PANE)
/** The innermost Text with exactly these words: the styled span, not the row that holds it. */
const span = async (ui: Awaited<ReturnType<typeof mountPane>>, text: string) =>
  (await ui.findAll({ type: 'Text', text: new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) })).at(-1)
const texts = async ($: Engine) => {
  const ui = await $.ui.mount(PANE)
  const all = (await ui.findAll({ type: 'Text' })).map(text => text.text)
  await ui.unmount()
  return all
}

test('the panel draws Context, Tokens and Usage sections under the status line', async ($, on) => {
  world(on, fill(30))
  await startSession($)
  await turnEnd($, USAGE)

  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: '◔ Context' })).toBeDefined()
  expect(await span(ui, '███')).toMatchObject({ props: { color: THEME_DEFAULTS.accent } })
  expect(await span(ui, ' 30%')).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '⇅ Tokens' })).toBeDefined()
  expect((await span(ui, '↑'))?.props.color).toBe('suggestion')
  expect(await ui.find({ type: 'Text', text: 'session ↑ 1.2k  ↓ 340' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '◷ Usage' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: ' ↻ 2h 10m' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: ' ↻ 3d 4h' })).toBeDefined()
  await ui.unmount()
})

test('the headings come in order: Context, Tokens, Usage', async ($, on) => {
  world(on, fill(30))
  await startSession($)
  await turnEnd($, USAGE)

  const headings = (await texts($)).filter(text => ['◔ Context', '⇅ Tokens', '◷ Usage'].includes(text ?? ''))
  expect(headings).toEqual(['◔ Context', '⇅ Tokens', '◷ Usage'])
})

test('a section with nothing to show is left out', async ($, on) => {
  world(on, fill(), [])
  await startSession($)

  const all = await texts($)
  expect(all).not.toContain('◔ Context')
  expect(all).not.toContain('⇅ Tokens')
  expect(all).not.toContain('◷ Usage')
})

test('the context section follows each measurement, yellow from 50% and red from 75%', async ($, on) => {
  world(on, fill(10))
  await startSession($)

  await measure($, 58)
  let ui = await $.ui.mount(PANE)
  expect(await span(ui, '██████')).toMatchObject({ props: { color: 'warning' } })
  expect(await span(ui, ' 58%')).toBeDefined()
  expect(await span(ui, ' (116000/200000)')).toBeDefined()
  await ui.unmount()

  await measure($, 82)
  ui = await $.ui.mount(PANE)
  expect(await span(ui, '████████')).toMatchObject({ props: { color: THEME_DEFAULTS.error } })
  await ui.unmount()
})

test('the context thresholds are options', { options: { contextWarnAt: 20, contextDangerAt: 40 } }, async ($, on) => {
  world(on, fill(30))
  await startSession($)

  const ui = await $.ui.mount(PANE)
  expect(await span(ui, '███')).toMatchObject({ props: { color: 'warning' } })
  await ui.unmount()
})

test('with no figure yet the context is counted once, as /context does, and shown with ~', async ($, on) => {
  const w = world(on, fill())
  w.live.estimate = 16
  await startSession($)
  await w.clock.advance(2000)

  const all = await texts($)
  expect(all).toContain(' ~16%')
  expect(all).toContain(' (32000/200000)')
})

test('the tokens section adds up the turns of the session', async ($, on) => {
  world(on)
  await startSession($)
  await turnEnd($, USAGE)
  await turnEnd($, { ...USAGE, input_tokens: 800, output_tokens: 60, cache_read_input_tokens: 0 })

  const all = await texts($)
  expect(all).toContain(' 800  ')
  expect(all).toContain('session ↑ 2.0k  ↓ 400')
})

test('the usage section takes the rate limits each response measures', async ($, on) => {
  world(on, fill(), [])
  await startSession($)
  await measure($, 12, [{ ...LIMITS[0]!, percentUsed: 91 }])

  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: ' 91%' })).toBeDefined()
  expect((await span(ui, ' ━━━━━━━━━'))?.props.color).toBe(THEME_DEFAULTS.error)
  await ui.unmount()
})

test('the usage section adopts a newer reading another session stored', async ($, on) => {
  const w = world(on)
  await startSession($)
  w.store.usageLimits = [{ ...LIMITS[0], percentUsed: 77 }, LIMITS[1]]
  w.store.usageAt = NOW + 1000
  await w.clock.advance(8000)

  expect(await texts($)).toContain(' 77%')
})

test('a new session shows the last stored reading before its first response', async ($, on) => {
  const w = world(on, fill(), [])
  w.store.usageLimits = [LIMITS[0]]
  w.store.usageAt = NOW - 1000
  await startSession($)

  expect(await texts($)).toContain(' 58%')
})
