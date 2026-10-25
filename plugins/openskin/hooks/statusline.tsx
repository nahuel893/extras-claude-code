import { atom, read, update } from 'claude-code'
import type { On, PluginOptions } from 'claude-code'
import { contextSection, measureContext, readThresholds, startContextMeter, stopContextMeter } from './meters/context'
import { countTurn, startTokenMeter, tokenSection } from './meters/tokens'
import { measureUsage, startUsageMeter, stopUsageMeter, usageSection } from './meters/usage'
import type { Theme } from './theme'
import type { StatusLines } from '../types'

/**
 * The status panel docked beside the transcript in fullscreen. Claude Code runs the person's
 * `~/.claude/statusline.sh`, which keeps each session's latest input in SESSIONS; a timer
 * runs the script again on this session's input whenever it changes (with OPENSKIN_PANEL
 * set, so it prints) and keeps the output in `$.state`, which the panel draws from (a render
 * hook cannot write state itself). Once docked, the panel marks the session in DOCKED and the
 * script prints nothing for Claude Code's own status line, which would repeat the panel.
 * Under the status line the panel draws the meters of `./meters/` (context fill, tokens,
 * subscription usage), whose hooks are registered here: a module takes one hook per event.
 */
const SESSIONS = '.cache/openskin/sessions'
const DOCKED = '.cache/openskin/docked'
const SCRIPT = '.claude/statusline.sh'
const REFRESH_MS = 1500
const PANE = 'openskin-status'
const SEPARATOR = / \| /

const statusLines = atom({ plugin: 'openskin', key: 'statusLines' } as const, [])

/** A run of text in one style, as the ANSI codes before it left the style. */
export type Span = { text: string; color?: string; backgroundColor?: string; bold?: boolean; dimColor?: boolean }

type Style = Omit<Span, 'text'>

/** A block of the panel under the status line: a muted heading over rows of styled spans. */
export type Section = { heading: string; rows: Span[][] }

/** The eight standard colors by name, so they follow the terminal's own palette. */
const STANDARD = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white']

/** The eight bright colors, xterm's defaults. */
const BRIGHT = ['#7f7f7f', '#ff0000', '#00ff00', '#ffff00', '#5c5cff', '#ff00ff', '#00ffff', '#ffffff']

const hex = (...channels: number[]) =>
  `#${channels.map(c => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0')).join('')}`

/** A color of the 256-color palette: the 16 basic ones, the 6x6x6 cube, then 24 greys. */
export const color256 = (n: number): string | undefined => {
  if (!Number.isInteger(n) || n < 0 || n > 255) return undefined
  if (n < 8) return STANDARD[n]
  if (n < 16) return BRIGHT[n - 8]
  if (n < 232) {
    const level = (v: number) => (v === 0 ? 0 : 55 + v * 40)
    const i = n - 16
    return hex(level(Math.floor(i / 36)), level(Math.floor(i / 6) % 6), level(i % 6))
  }
  const grey = 8 + (n - 232) * 10
  return hex(grey, grey, grey)
}

/** Applies one SGR sequence's parameters to the style in force. */
const applySgr = (style: Style, params: number[]): Style => {
  const next = { ...style }
  for (let i = 0; i < params.length; i++) {
    const p = params[i]!
    if (p === 0) {
      for (const key of Object.keys(next) as (keyof Style)[]) delete next[key]
    } else if (p === 1) next.bold = true
    else if (p === 2) next.dimColor = true
    else if (p === 22) {
      delete next.bold
      delete next.dimColor
    } else if (p >= 30 && p <= 37) next.color = STANDARD[p - 30]
    else if (p >= 90 && p <= 97) next.color = BRIGHT[p - 90]
    else if (p === 39) delete next.color
    else if (p >= 40 && p <= 47) next.backgroundColor = STANDARD[p - 40]
    else if (p >= 100 && p <= 107) next.backgroundColor = BRIGHT[p - 100]
    else if (p === 49) delete next.backgroundColor
    else if (p === 38 || p === 48) {
      const key = p === 38 ? 'color' : 'backgroundColor'
      let value: string | undefined
      if (params[i + 1] === 5) {
        value = color256(params[i + 2] ?? -1)
        i += 2
      } else if (params[i + 1] === 2) {
        value = hex(params[i + 2] ?? 0, params[i + 3] ?? 0, params[i + 4] ?? 0)
        i += 4
      }
      if (value) next[key] = value
    }
  }
  return next
}

/** Every escape sequence: CSI (SGR and the rest), OSC, and two-character escapes. */
const ESCAPE = /\x1b(?:\[([0-9;:]*)([@-~])|\][^\x07\x1b]*(?:\x07|\x1b\\)|[@-Z\\-_])/g

/**
 * One line of terminal output as styled spans: SGR codes become styles, any other
 * escape sequence or control character is dropped.
 */
export const parseAnsi = (line: string): Span[] => {
  const spans: Span[] = []
  let style: Style = {}
  let at = 0

  const push = (raw: string) => {
    const text = raw.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '')
    if (!text) return
    const last = spans[spans.length - 1]
    const { text: _, ...lastStyle } = last ?? { text: '' }
    if (last && JSON.stringify(lastStyle) === JSON.stringify(style)) last.text += text
    else spans.push({ text, ...style })
  }

  for (const match of line.matchAll(ESCAPE)) {
    push(line.slice(at, match.index))
    at = match.index! + match[0].length
    if (match[2] === 'm') {
      const params = (match[1] ?? '').split(/[;:]/).map(p => (p === '' ? 0 : Number(p)))
      style = applySgr(style, params)
    }
  }
  push(line.slice(at))
  return spans
}

/** Columns a block adds around its text: both gutters, the bar and the content padding. */
const BLOCK_CHROME = 2 + 1 + 2 + 2 + 2

/**
 * Columns a status line takes on screen: its text without escape codes, an emoji
 * counted as two columns, joiners and variation selectors as none.
 */
export const displayWidth = (line: string): number =>
  [...parseAnsi(line).map(span => span.text).join('')].reduce(
    (width, char) =>
      width + (/[‍︎️]/.test(char) ? 0 : /\p{Extended_Pictographic}/u.test(char) ? 2 : 1),
    0,
  )

/** The script's output as lines: trailing blank lines and carriage returns dropped. */
export const outputLines = (stdout: string): StatusLines => {
  const lines = stdout.replace(/\r/g, '').split('\n')
  while (lines.length && !lines[lines.length - 1]!.trim()) lines.pop()
  return lines
}

/**
 * The status line's parts the meter sections replace: its 5-hour and weekly windows
 * (Usage) and its context bar, `██░░ 27% (…)` (Context).
 */
const REPLACED_PART = /^(5h|7d):|^[█░]+\s+\d+%/

/** Text of a row with its escape codes gone. */
const plain = (row: string) => parseAnsi(row).map(span => span.text).join('')

/**
 * The panel's rows: one per part of the status line, as a sidebar reads (the script's ` | `
 * separators become line breaks), without the parts a meter section shows.
 */
export const panelRows = (lines: StatusLines): string[] =>
  lines
    .flatMap(line => line.split(SEPARATOR))
    .map(row => row.trim())
    .filter(row => row && !REPLACED_PART.test(plain(row).trim()))

export const registerStatusPanel = (on: On, theme: Theme, options: PluginOptions) => {
  const thresholds = readThresholds(options)
  // This session's mark in DOCKED, known once session.start has read the home and session id.
  let dockedMark = ''

  on('session.start', async ($, e, next) => {
    // The meters drawn under the status line; one that fails leaves the others and the status line be.
    await Promise.allSettled([startContextMeter($), startTokenMeter($), startUsageMeter($, e.isInteractive)])

    const home = await $.env.get('HOME')
    const id = await $.session.id().catch(() => '')
    if (!home || !id) return next(e)

    const source = `${home}/${SESSIONS}/${id}.json`
    const script = `${home}/${SCRIPT}`
    dockedMark = `${home}/${DOCKED}/${id}`
    let seenMtime = -1
    let seenJson = ''
    let isBusy = false

    // The script rewrites SOURCE on every run, so a new mtime alone is not new input:
    // the text decides.
    const refresh = async () => {
      if (isBusy) return
      isBusy = true
      try {
        const { mtimeMs } = await $.fs.stat(source)
        if (mtimeMs === seenMtime) return
        seenMtime = mtimeMs

        const json = await $.fs.read(source)
        if (json === seenJson) return
        seenJson = json

        const { exitCode, stdout } = await $.process.run([script], {
          stdin: json,
          env: { OPENSKIN_PANEL: '1' },
          timeoutMs: 10_000,
        })
        if (exitCode !== 0) return

        const lines = outputLines(stdout)
        await update($, statusLines, () => lines)
      } catch {
        // No input yet, or the script failed: the band keeps what it last drew.
      } finally {
        isBusy = false
      }
    }

    void refresh()
    $.clock.every(REFRESH_MS, () => void refresh())

    await $.command.register({ name: 'panel', description: 'Open the status panel beside the transcript' })

    return next(e)
  })

  on('session.end', ($, e, next) => {
    stopContextMeter()
    stopUsageMeter()
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await Promise.all([measureContext($, e), measureUsage($, e.rateLimits)])
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    await countTurn($, e.usage)
    return next(e)
  })

  on('command.run', { command: 'panel' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Status' })

    return { text: 'Status panel opened.' }
  })

  // Only the fullscreen layout docks a pane beside the transcript; elsewhere a pane
  // would take rows above the prompt, so the status line stays where it is.
  let isOpened = false
  let isMarked = false
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.viewport?.isFullscreen === true && !isOpened) {
      isOpened = true
      void $.ui.open({ id: PANE, title: 'Status' })
    }
    // The panel shows the status line now: the script leaves Claude Code's own one empty.
    // The first draws can come before session.start knows the mark, so a later one writes it.
    if (isOpened && dockedMark && !isMarked) {
      isMarked = true
      void $.fs.write(dockedMark, '').catch(() => {
        isMarked = false
      })
    }

    return next(e)
  })

  // The status line's parts, one row each, then a section per meter that has something to show.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    // The body less the Box's own padding on each side.
    const columns = Math.max(1, e.props.bodyColumns - 2)
    // Under the status line, in this order: the context window, the tokens, the subscription.
    const [lines, ...drawn] = await Promise.all([
      read($, statusLines),
      contextSection($, thresholds),
      tokenSection($),
      usageSection($, columns),
    ])
    const rows = panelRows(lines)
    const sections = drawn.filter((section): section is Section => section !== null)

    const drawRow = (spans: Span[]) => (
      <Text wrap="truncate-end">
        {spans.map(({ text, ...style }) => (
          <Text {...style}>{text}</Text>
        ))}
      </Text>
    )

    return (
      <Box flexDirection="column" paddingX={1}>
        {rows.length === 0 && <Text color={theme.muted}>Waiting for the status line…</Text>}
        {rows.map(row => drawRow(parseAnsi(row)))}
        {sections.map(section => (
          <Box flexDirection="column" marginTop={1}>
            <Text color={theme.muted}>{section.heading}</Text>
            {section.rows.map(drawRow)}
          </Box>
        ))}
      </Box>
    )
  })
}
