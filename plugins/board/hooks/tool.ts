import { boardLines, MARKS } from './board'

/** The board tool's short name; the model calls it as `mcp__board__board`. */
export const TOOL_NAME = 'board'

export const TOOL_DESCRIPTION = [
  "Keep this session's board of work, shown to the user beside the conversation.",
  'Use it for multi-step work, not for trivial one-step tasks.',
  'add: when you start a piece of work, add an item for each step (returns its number).',
  'done: mark item n done as soon as it finishes, not at the end.',
  'wait: mark item n as waiting when it is blocked on the user.',
  'Items are numbered from 1 in board order.',
].join(' ')

export const TOOL_SCHEMA = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['add', 'done', 'wait'], description: 'add a pending item, or mark item n done or waiting' },
    text: { type: 'string', description: 'add: the item, one short line' },
    item: { type: 'integer', minimum: 1, description: 'done, wait: the item number' },
  },
  required: ['action'],
} as const

const [DONE, PENDING, WAITING] = MARKS

/** How far the board has come, as the tool replies it: `2 of 5 done`. */
const progressOf = (lines: readonly string[]) => `${lines.filter(line => line.startsWith(DONE)).length} of ${lines.length} done`

const itemsOf = (count: number) => `${count} item${count === 1 ? '' : 's'}`

/** The board's lines numbered from 1, the numbers the tool's `done` and `wait` take. */
export const numbered = (lines: readonly string[]) => lines.map((line, index) => `${index + 1}. ${line}`).join('\n')

/** The line the session start hands the model, as the tool may wait behind ToolSearch. */
export const hintOf = (tool: string) =>
  `Board: for multi-step work, keep this session's board with the ${tool} tool: add items when you start, mark each done as soon as it finishes, wait when blocked on the user.`

/** The one line that reminds the model of pending items it has not touched for a while. */
export const reminderOf = (pending: number) => `Board: ${pending} pending. Mark finished items done with the board tool.`

/**
 * The numbered board handed to the model once after it changed outside the tool: rewritten by
 * `/board`, or edited by hand.
 */
export const changedOf = (lines: readonly string[], isRewrite = false) =>
  `${isRewrite ? 'The board was rewritten by /board.' : 'The board changed outside the board tool.'} Current items:\n${numbered(lines)}`

/** The reply to a call that waited for `/board` as long as a hook may, and wrote nothing. */
export const BUSY = '/board is rewriting the board, call again shortly.'

/** How many items are still pending. */
export const pendingOf = (lines: readonly string[]) => lines.filter(line => line.startsWith(PENDING)).length

/** The board as file text: one line each and a final newline, or empty. */
export const boardText = (lines: readonly string[]) => (lines.length ? `${lines.join('\n')}\n` : '')

/**
 * One tool call applied to the board's text: the new text when it changed, and the one short line
 * the model reads. A call that cannot apply changes nothing and says why.
 */
export const applyCall = (board: string, input: Record<string, unknown>): { board?: string; reply: string } => {
  const lines = boardLines(board)
  const { action } = input

  if (action === 'add') {
    const text = typeof input.text === 'string' ? input.text.replace(/\s+/g, ' ').trim() : ''
    const item = MARKS.reduce((rest, mark) => (rest.startsWith(mark) ? rest.slice(mark.length).trim() : rest), text)
    if (!item) return { reply: "Give the item's text to add." }

    const next = [...lines, `${PENDING}${item}`]
    return { board: boardText(next), reply: `ok · added item ${next.length} · ${progressOf(next)}` }
  }

  if (action === 'done' || action === 'wait') {
    const n = input.item
    if (n === undefined || n === null || n === '') return { reply: 'Give the item number to mark.' }
    const index = typeof n === 'number' ? n - 1 : Number(n) - 1
    if (!Number.isInteger(index) || index < 0 || index >= lines.length) {
      return { reply: `No item ${String(n)}: the board has ${itemsOf(lines.length)}.` }
    }

    const mark = action === 'done' ? DONE : WAITING
    const next = lines.map((line, i) => (i === index ? `${mark}${line.slice(2)}` : line))
    return { board: boardText(next), reply: `ok · ${progressOf(next)}` }
  }

  return { reply: `Unknown action ${String(action)}: use add, done or wait.` }
}
