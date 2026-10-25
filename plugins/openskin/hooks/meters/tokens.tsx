/*
 * Ported from better-claude's token-meter:
 * https://github.com/midudev/better-claude/blob/main/plugins/token-meter/hooks/register.tsx
 * Copyright (c) 2026 Miguel Ángel Durán (midudev), MIT License (see ../../NOTICE).
 *
 * Changed for openskin: the meter is a section of the status panel instead of a suffix
 * of the hint line, and its atoms live under openskin's state.
 */
import { atom, read, update } from 'claude-code'
import type { EngineInterface, ModelUsage } from 'claude-code'
import type { Tokens } from '../../types'
import type { Section, Span } from '../statusline'

const ZERO: Tokens = { input: 0, output: 0, cached: 0 }
const turn = atom({ plugin: 'openskin', key: 'tokenTurn' } as const, null as Tokens | null)
const session = atom({ plugin: 'openskin', key: 'tokenSession' } as const, ZERO)

/** "340", "1.2k": a count as the meter writes it. */
export const short = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`)

/** A turn's usage as the meter counts it: cache reads and writes together. */
export const tokensOf = (usage: ModelUsage): Tokens => ({
  input: usage.input_tokens,
  output: usage.output_tokens,
  cached: usage.cache_read_input_tokens + usage.cache_creation_input_tokens,
})

export const addTokens = (total: Tokens, last: Tokens): Tokens => ({
  input: total.input + last.input,
  output: total.output + last.output,
  cached: total.cached + last.cached,
})

/** The last turn in color (input blue, output green, cache Claude orange), then the session total dim. */
export const tokenRows = (last: Tokens, total: Tokens): Span[][] => [
  [
    { text: '↑', color: 'suggestion' },
    { text: ` ${short(last.input)}  ` },
    { text: '↓', color: 'success' },
    { text: ` ${short(last.output)}  ` },
    { text: 'cache', color: 'claude' },
    { text: ` ${short(last.cached)}` },
  ],
  [{ text: `session ↑ ${short(total.input)}  ↓ ${short(total.output)}`, dimColor: true }],
]

/** At `session.start`: the count starts over. */
export async function startTokenMeter($: EngineInterface) {
  await update($, turn, () => null)
  await update($, session, () => ZERO)
}

/** At `turn.complete`: the turn's tokens, added to the session's. */
export async function countTurn($: EngineInterface, usage: ModelUsage | undefined) {
  if (!usage) return
  const last = tokensOf(usage)
  await update($, turn, () => last)
  await update($, session, total => addTokens(total, last))
}

/** The Tokens section of the panel; nothing before the first turn. */
export async function tokenSection($: EngineInterface): Promise<Section | null> {
  const last = await read($, turn)
  if (last === null) return null

  return { heading: 'Tokens', rows: tokenRows(last, await read($, session)) }
}
