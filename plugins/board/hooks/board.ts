/** Where the boards live under the home directory, one file per project. */
const BOARDS = '.cache/extras-claude-code/board'

/** The marks a board line starts with: done, pending, waiting on the person's decision. */
export const MARKS = ['✓ ', '○ ', '◇ '] as const

/** A project's name on disk: its directory with every `/` a `-`, as `-home-nh-projects-x`. */
export const slugOf = (cwd: string) => cwd.replace(/\//g, '-')

/** The board file of the project in `cwd`. */
export const boardPath = (home: string, cwd: string) => `${home}/${BOARDS}/${slugOf(cwd)}.md`

/**
 * The board's lines out of the model's reply: each trimmed, a list bullet before the mark dropped,
 * and only those that start with a mark kept, so any preamble or closing remark is left out.
 */
export const boardLines = (reply: string): string[] =>
  reply
    .split('\n')
    .map(line => line.trim().replace(/^[-*]\s+/, ''))
    .filter(line => MARKS.some(mark => line.startsWith(mark)) && line.length > 2)

/**
 * The conversation as plain text, `User:` and `Assistant:` turns apart: the engine's reminders
 * dropped, empty messages skipped, and only the last `limit` characters kept, the latest work.
 */
export const transcriptOf = (messages: readonly { role: 'user' | 'assistant'; text: string }[], limit: number) => {
  const text = messages
    .map(({ role, text }) => ({ role, text: text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim() }))
    .filter(message => message.text)
    .map(({ role, text }) => `${role === 'user' ? 'User' : 'Assistant'}: ${text}`)
    .join('\n\n')

  return text.length > limit ? text.slice(-limit) : text
}

export const SYSTEM = [
  'You keep a project board: a short list of what is done, what is pending and what waits on the user.',
  'You are given the previous board, if any, and the latest part of a conversation between the user and a coding assistant.',
  'Write the updated board. One item per line, each line starting with exactly one of these marks and a space:',
  '"✓ " for done, "○ " for pending, "◇ " for waiting on the user\'s decision.',
  'Keep each item concise, at most about 15 items in all.',
  'Keep the items of the previous board that are still valid, and mark them done when the conversation shows they are.',
  'Write in the language the conversation is held in.',
  'Answer with the board lines alone: no heading, no other text.',
].join('\n')

/** The one user message: the previous board, then the conversation, each in its own tags. */
export const promptOf = (previous: string, transcript: string) =>
  `<previous_board>\n${previous.trim() || '(none)'}\n</previous_board>\n\n<conversation>\n${transcript}\n</conversation>`
