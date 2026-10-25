/*
 * Tokens, Fill and Limit are ported from better-claude:
 * https://github.com/midudev/better-claude/blob/main/plugins/token-meter/types/index.d.ts
 * https://github.com/midudev/better-claude/blob/main/plugins/context-meter/types/index.d.ts
 * https://github.com/midudev/better-claude/blob/main/plugins/sub-meter/types/index.d.ts
 * Copyright (c) 2026 Miguel Ángel Durán (midudev), MIT License (see ../NOTICE).
 */

/** The status line script's latest output, one entry per line, ANSI codes kept. */
export type StatusLines = string[]

/** The board mod's file for this project, one `✓ `, `○ ` or `◇ ` line per item. */
export type BoardLines = string[]

/** Token counts of one turn, or summed over the session. */
export type Tokens = { input: number; output: number; cached: number }

/**
 * The context window's fill, 0 to 100: the engine's figure from the last response, or, while it has
 * none (a fresh, resumed, compacted or rewound session), /context's count of it (`isEstimate`).
 * null when there is neither.
 */
export type Fill = { value: number; isEstimate: boolean } | null

/** One rate-limit window of the subscription, as the last API response reported it. */
export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

declare module 'claude-code' {
  interface PluginState {
    openskin: {
      statusLines: StatusLines
      tokenTurn: Tokens | null
      tokenSession: Tokens
      contextFill: Fill
      usageLimits: Limit[]
      usageTick: number
      board: BoardLines
      summary: string
    }
  }
}
