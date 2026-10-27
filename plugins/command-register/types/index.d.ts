/** One shell command Claude gave: the prompt counter of its turn, the stored row it came from and its text. */
export type Command = { turn: number; row: string; text: string }

declare module 'claude-code' {
  interface PluginState {
    'command-register': {
      commands: Shaped<Command[]>
      turn: number
      shown: number | null
      focusKey: string | null
      filter: string
    }
  }
}
