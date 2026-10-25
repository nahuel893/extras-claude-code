import type { Elements, RenderChildren } from 'claude-code'
import type { Theme } from './theme'

const SHELL_LANGUAGES = new Set(['bash', 'sh', 'zsh', 'shell', 'console', 'fish', 'terminal', 'shellsession'])

// An untagged fence still counts as a command when it opens like one: the `!` that runs it
// in Claude Code, a `$` prompt, or sudo. Anything else (output, a config file) stays prose.
const LOOKS_LIKE_COMMAND = /^\s*(!|\$\s|sudo\s)/

// Asks for tagged fences at the source, so commands that open with none of those still get framed.
export const SHELL_FENCE_RULE = {
  id: 'openskin:shell-fences',
  text:
    'When you give the person a shell command to run, put it in its own fenced code block tagged with ' +
    'its shell language (```bash), never an untagged fence or inline code, so the interface frames it as a command.',
  scope: 'session',
} as const

/** The engine's own gutter in front of a row it draws (its bullet column). */
export const ENGINE_GUTTER = 2

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

type CommandUi = Pick<Elements['terminal'], 'Box' | 'Text' | 'Code'>

/** A shell command in its round frame, labelled `❯ command`, highlighted in its language. */
export const drawCommand = (
  { Box, Text, Code }: CommandUi,
  theme: Theme,
  command: Extract<Segment, { kind: 'command' }>,
  key?: string,
) => (
  <Box key={key} flexDirection="column" borderStyle="round" borderColor={theme.command} paddingX={1}>
    <Text color={theme.command} bold>
      ❯ command
    </Text>
    <Code source={command.code} language={command.language} />
  </Box>
)

/**
 * A reply left to the engine's drawing but for its shell commands: each prose piece is
 * drawn by `drawProse` (the engine), each command framed behind the engine's bullet
 * gutter so it lines up with the text, with a row clear above it as the engine's rows have.
 */
export const drawFramedCommands = async (
  ui: CommandUi,
  theme: Theme,
  segments: Segment[],
  drawProse: (text: string, index: number) => Promise<RenderChildren>,
) => {
  const { Box } = ui
  const rows = await Promise.all(
    segments.map(async (segment, i) =>
      segment.kind === 'prose' ? (
        <Box key={`prose:${i}`} flexDirection="column">
          {await drawProse(segment.text, i)}
        </Box>
      ) : (
        <Box key={`command:${i}`} flexDirection="column" paddingLeft={ENGINE_GUTTER} marginTop={1}>
          {drawCommand(ui, theme, segment)}
        </Box>
      ),
    ),
  )

  return <Box flexDirection="column">{rows}</Box>
}
