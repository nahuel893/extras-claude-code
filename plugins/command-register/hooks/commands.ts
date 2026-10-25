// The fence rule is the opentheme mod's (`opentheme/hooks/commands.tsx`), copied rather than shared:
// each mod installs on its own, and the two must agree on what a command is, so a block framed as a
// command there is the block numbered here.

const SHELL_LANGUAGES = new Set(['bash', 'sh', 'zsh', 'shell', 'console', 'fish', 'terminal', 'shellsession'])

// An untagged fence still counts as a command when it opens like one: the `!` that runs it
// in Claude Code, a `$` prompt, or sudo. Anything else (output, a config file) stays prose.
const LOOKS_LIKE_COMMAND = /^\s*(!|\$\s|sudo\s)/

export type Segment = { kind: 'prose'; text: string } | { kind: 'command'; code: string; language: string }

const OPENING_FENCE = /^( {0,3})(`{3,}|~{3,})[ \t]*([^\s`~]*)/

const isClosingFence = (line: string, fence: string) => {
  const match = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line)

  return match !== null && match[1]![0] === fence[0] && match[1]!.length >= fence.length
}

const stripIndent = (line: string, indent: number) => line.replace(new RegExp(`^ {0,${indent}}`), '')

/**
 * Splits a reply's markdown into prose and shell commands. Only closed fences whose
 * language is a shell become commands; every other fence stays in the prose as written.
 */
export const splitCommands = (text: string): Segment[] => {
  const lines = text.split('\n')
  const segments: Segment[] = []
  let prose: string[] = []

  const flushProse = () => {
    const chunk = prose.join('\n').trim()
    if (chunk) segments.push({ kind: 'prose', text: chunk })
    prose = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const open = OPENING_FENCE.exec(line)
    const close = open ? lines.findIndex((next, j) => j > i && isClosingFence(next, open[2]!)) : -1

    if (!open || close === -1) {
      prose.push(line)
      continue
    }

    const language = open[3]!.toLowerCase()
    const body = lines.slice(i + 1, close)
    const isUntaggedCommand = language === '' && LOOKS_LIKE_COMMAND.test(body.find(l => l.trim()) ?? '')

    if (SHELL_LANGUAGES.has(language) || isUntaggedCommand) {
      flushProse()
      segments.push({
        kind: 'command',
        code: body.map(l => stripIndent(l, open[1]!.length)).join('\n'),
        language: language || 'bash',
      })
    } else {
      prose.push(line, ...body, lines[close]!)
    }
    i = close
  }

  flushProse()
  return segments
}

/**
 * What the person pastes for a command block: the block as written, less a leading `$ ` on any
 * line, which is a prompt shown to the reader and not part of the command. A leading `!` stays:
 * it is Claude Code's own run prefix, pasted at its prompt to run the command there.
 */
export const commandText = (code: string) =>
  code
    .split('\n')
    .map(line => line.replace(/^(\s*)\$ /, '$1'))
    .join('\n')
    .trim()

/** Every shell command in a reply's text, in the order given, as the person would paste it. */
export const commandsIn = (text: string) =>
  splitCommands(text).flatMap(segment => {
    if (segment.kind !== 'command') return []
    const command = commandText(segment.code)

    return command ? [command] : []
  })
