/** Where the projects live under the home directory, a folder per session in each. */
const PROJECTS = '.cache/extras-claude-code/projects'

/** A project's name on disk: its directory with every `/` a `-`, as `-home-user-projects-x`. */
export const slugOf = (cwd: string) => cwd.replace(/\//g, '-')

/** The summary file of session `id`, in the folder of the project in `cwd`. */
export const summaryPath = (home: string, cwd: string, id: string) => `${home}/${PROJECTS}/${slugOf(cwd)}/${id}/summary.md`

/** The summary out of the model's reply: trimmed, a leading markdown heading dropped. */
export const summaryText = (reply: string) => reply.trim().replace(/^#{1,6}\s[^\n]*\n+/, '').trim()

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
  'You summarize a working session between a user and a coding assistant.',
  'You are given the latest part of their conversation.',
  'Write a short narrative summary: the goal, what happened, the decisions taken, and where things stand now.',
  'At most about 150 words, in plain prose. No heading, no list, no preamble.',
  'Write in the language the conversation is held in.',
].join('\n')

/** The one user message: the conversation in its own tags. */
export const promptOf = (transcript: string) => `<conversation>\n${transcript}\n</conversation>`
