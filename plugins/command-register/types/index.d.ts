/** One shell command Claude gave: the stored row it came from and its text. Its number is its place + 1. */
export type Command = { row: string; text: string }

declare module 'claude-code' {
  interface PluginState {
    'command-register': { commands: Shaped<Command[]>; isOpen: boolean; focusKey: string | null; filter: string }
  }
}
