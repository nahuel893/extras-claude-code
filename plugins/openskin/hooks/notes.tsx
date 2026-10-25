import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'
import type { BoardLines } from '../types'
import type { Section, Span } from './statusline'
import type { Theme } from './theme'

/**
 * The Board and Summary sections of the status panel, drawn from the files the board and
 * summarize mods write. Neither mod is needed: with no file there is no section. Each file is
 * polled on the status panel's timer, read again only when its mtime moves, and kept in `$.state`
 * for the panel to draw.
 */
const BOARDS = '.cache/extras-claude-code/board'
const SUMMARIES = '.cache/extras-claude-code/summaries'
const MARKS = ['✓', '○', '◇']

const board = atom({ plugin: 'openskin', key: 'board' } as const, [] as BoardLines)
const summary = atom({ plugin: 'openskin', key: 'summary' } as const, '')

/** The board of the project in `cwd` (its slug: every `/` a `-`) and the summary of session `id`. */
export const notePaths = (home: string, cwd: string, id: string) => ({
  board: `${home}/${BOARDS}/${cwd.replace(/\//g, '-')}.md`,
  summary: `${home}/${SUMMARIES}/${id}.md`,
})

/** A board line as a row: its mark colored (done muted, waiting the accent, pending plain), then the item. */
export const boardRow = (line: string, theme: Theme): Span[] => {
  const mark = line.slice(0, 1)
  const color = mark === '✓' ? theme.muted : mark === '◇' ? theme.accent : undefined

  return [{ text: mark, ...(color === undefined ? {} : { color }) }, { text: line.slice(1) }]
}

/** The file's board lines: those that open on a mark, blank lines and stray text left out. */
const linesOf = (text: string): BoardLines =>
  text
    .split('\n')
    .map(line => line.trim())
    .filter(line => MARKS.includes(line.slice(0, 1)) && line.length > 2)

/**
 * At `session.start`: answers the poll that brings both sections up to date. A file read once
 * is read again only when its mtime moves; a file that goes away empties its section.
 */
export function startNotes($: EngineInterface, home: string, cwd: string, id: string) {
  const paths = notePaths(home, cwd, id)
  const watched = [
    { path: paths.board, seen: -1, apply: (text: string) => update($, board, () => linesOf(text)) },
    { path: paths.summary, seen: -1, apply: (text: string) => update($, summary, () => text.trim()) },
  ]
  let isBusy = false

  return async () => {
    if (isBusy) return
    isBusy = true
    try {
      await Promise.all(
        watched.map(async file => {
          try {
            const { mtimeMs } = await $.fs.stat(file.path)
            if (mtimeMs === file.seen) return
            const text = await $.fs.read(file.path)
            file.seen = mtimeMs
            await file.apply(text)
          } catch {
            // No file (yet, or any more): its section goes once it had one.
            if (file.seen === -1) return
            file.seen = -1
            await file.apply('')
          }
        }),
      )
    } finally {
      isBusy = false
    }
  }
}

/** The Board section: one row per line; nothing with no board. */
export async function boardSection($: EngineInterface, theme: Theme): Promise<Section | null> {
  const lines = await read($, board)
  if (lines.length === 0) return null

  return { heading: '≡ Board', rows: lines.map(line => boardRow(line, theme)), wrap: 'wrap' }
}

/** The Summary section: one row per paragraph, wrapped to the panel; nothing with no summary. */
export async function summarySection($: EngineInterface): Promise<Section | null> {
  const text = await read($, summary)
  if (!text) return null

  const paragraphs = text.split(/\n\s*\n/).map(paragraph => paragraph.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean)

  return { heading: '¶ Summary', rows: paragraphs.map(paragraph => [{ text: paragraph }]), wrap: 'wrap' }
}
