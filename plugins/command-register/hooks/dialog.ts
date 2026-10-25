// Pure layout helpers of the `/cc` dialog: no engine calls, so the module-load rule about
// functions that receive `$` does not touch them.

/** A register entry as the list holds it: its 1-based register number and its text. */
export type Entry = { n: number; text: string }

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

/** The register, newest first, narrowed to the commands that hold `filter` (case-insensitive). */
export const visible = (list: readonly { text: string }[], filter: string): Entry[] => {
  const needle = filter.trim().toLowerCase()

  return list
    .map((command, i) => ({ n: i + 1, text: command.text }))
    .reverse()
    .filter(entry => needle === '' || entry.text.toLowerCase().includes(needle))
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

/**
 * The hint's text before the close button (`0: close`), by whether the band holds the keyboard and
 * how much room the line has. One row always: the narrower the band, the fewer the words.
 */
export const hintText = (isFocused: boolean, inner: number) => {
  if (isFocused) {
    if (inner >= 64) return '↑↓ move · enter copy · type to filter · esc back · '
    if (inner >= 44) return '↑↓ move · enter copy · esc back · '

    return '↑↓ enter esc · '
  }
  if (inner >= 44) return '1-9 copy · ctrl+x tab to browse · '

  return '1-9 copy · '
}
