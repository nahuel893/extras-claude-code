// Pure layout helpers of the `/cc` pane: no engine calls, so the module-load rule about
// functions that receive `$` does not touch them.

/** A register entry as the list holds it: its 1-based register number and its text. */
export type Entry = { n: number; text: string }

/** A message: the commands Claude gave answering one prompt, in order, numbered 1..k. */
export type Message = { turn: number; commands: Entry[] }

/**
 * The register grouped by turn, oldest message first. A turn that gave no command has no message,
 * so every message holds at least one command.
 */
export const messagesOf = (list: readonly { turn: number; text: string }[]): Message[] => {
  const messages: Message[] = []
  for (const { turn, text } of list) {
    let message = messages.at(-1)
    if (message === undefined || message.turn !== turn) {
      message = { turn, commands: [] }
      messages.push(message)
    }
    message.commands.push({ n: message.commands.length + 1, text })
  }

  return messages
}

/** The command's first line, as a notice or a list row names it. */
export const firstLine = (text: string) => text.split('\n').find(line => line.trim())?.trim() ?? ''

/** Cuts `text` to `room` cells, ending in an ellipsis when it was longer. */
export const cut = (text: string, room: number) => (text.length > room ? `${text.slice(0, Math.max(1, room - 1))}…` : text)

/**
 * A list row's label: the command's first line, ` …` when more lines follow, cut to `room` and with
 * control characters (a tab) drawn as spaces, which a label refuses.
 */
export const rowLabel = (text: string, room: number) => {
  const first = firstLine(text).replace(/[\u0000-\u001f\u007f]/g, ' ')
  const more = text.trim().includes('\n') ? ' …' : ''

  return cut(`${first}${more}`, Math.max(8, room))
}

/** A message's commands, in order, narrowed to those that hold `filter` (case-insensitive). */
export const visible = (entries: readonly Entry[], filter: string): Entry[] => {
  const needle = filter.trim().toLowerCase()

  return entries.filter(entry => needle === '' || entry.text.toLowerCase().includes(needle))
}

/**
 * A command whole as preview lines: its own lines, each broken at `width`, at most `max` of them
 * with an ellipsis ending the last when more would follow.
 */
export const previewLines = (text: string, width: number, max: number) => {
  const w = Math.max(8, width)
  const lines = text
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ')
    .replace(/\t/g, '  ')
    .split('\n')
    .flatMap(line => (line === '' ? [' '] : (line.match(new RegExp(`.{1,${w}}`, 'gu')) ?? [' '])))
  if (lines.length <= max) return lines

  return [...lines.slice(0, max - 1), cut(`${lines[max - 1]}…`, w)]
}

/** The preview's rule: `┄ preview ┄┄┄…` to `width` cells. */
export const previewRule = (width: number) => `┄ preview ${'┄'.repeat(Math.max(0, width - 10))}`

/** The hint's text, by how much room the pane's line has: the fewer the cells, the fewer the words. */
export const hintText = (inner: number) => {
  if (inner >= 58) return '↑↓ move · enter or 1-9 copy · h/l message · esc close'
  if (inner >= 40) return '1-9 copy · h/l message · esc close'

  return '1-9 · h/l · esc'
}
