import type { Command } from '../types'

/** Where the projects live under the home directory, a folder per session in each. */
const PROJECTS = '.cache/refined-claude-code/projects'

/** A project's name on disk: its directory with every `/` a `-`, as `-home-user-projects-x`. */
export const slugOf = (cwd: string) => cwd.replace(/\//g, '-')

/** The register file of session `id`, in the folder of the project in `cwd`. */
export const registerPath = (home: string, cwd: string, id: string) => `${home}/${PROJECTS}/${slugOf(cwd)}/${id}/commands.json`

const isCommand = (value: unknown): value is Command => {
  if (typeof value !== 'object' || value === null) return false
  const { turn, row, text } = value as Record<string, unknown>

  return typeof turn === 'number' && Number.isFinite(turn) && typeof row === 'string' && typeof text === 'string'
}

/** The commands a register file holds, oldest first; a corrupt or foreign file holds none. */
export const parseRegister = (text: string): Command[] => {
  try {
    const parsed: unknown = JSON.parse(text)

    return Array.isArray(parsed) && parsed.every(isCommand) ? parsed.map(({ turn, row, text }) => ({ turn, row, text })) : []
  } catch {
    return []
  }
}

/** The register as file text. */
export const registerText = (list: readonly Command[]) => JSON.stringify(list)

/** The highest turn among `list`, 0 when it is empty. */
export const lastTurn = (list: readonly Command[]) => list.reduce((top, command) => Math.max(top, command.turn), 0)
