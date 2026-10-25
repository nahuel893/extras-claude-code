/** The status line script's latest output, one entry per line, ANSI codes kept. */
export type StatusLines = string[]

declare module 'claude-code' {
  interface PluginState {
    openskin: { statusLines: StatusLines }
  }
}
