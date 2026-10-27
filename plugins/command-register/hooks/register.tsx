import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderSurface } from 'claude-code'
import type { Command } from '../types'
import { commandsIn } from './commands'
import { lastTurn, parseRegister, registerPath, registerText } from './store'
import { firstLine, hintText, messagesOf, previewLines, previewRule, rowLabel, visible } from './dialog'
import type { Message } from './dialog'

/**
 * The register, oldest first. Each command carries the prompt counter of its turn (`turn`), which
 * is what makes a message. Change the tag when a command's fields change: it declines what an
 * earlier version stored, which outlives a reload (commands-1 held no `turn`, so it is dropped).
 */
const commands = atom({ plugin: 'command-register', key: 'commands' } as const, [], { shape: 'commands-2' })

/** How many prompts the person has sent: the turn a reply's commands belong to. */
const turn = atom({ plugin: 'command-register', key: 'turn' } as const, 0)

/** Whether a failed save has been told to the person already: one toast, not one per append. */
const saveWarned = atom({ plugin: 'command-register', key: 'saveWarned' } as const, false)

/** The turn of the message the pane shows; null is the latest one. */
const shown = atom({ plugin: 'command-register', key: 'shown' } as const, null)

/** The key of the pane element holding the focus ring, when the pane holds the keyboard. */
const focusKey = atom({ plugin: 'command-register', key: 'focusKey' } as const, null)

/** What the person typed in the pane's filter. */
const filter = atom({ plugin: 'command-register', key: 'filter' } as const, '')

const PANE = 'cc'
const EMPTY = 'No shell commands yet: the register fills as Claude gives them.'
const USAGE = 'Usage: /cc to pick from the panel, or /cc <n> to copy command n of the latest message.'
const OPENED = 'Command panel open: a digit or Enter copies a command, Esc closes it.'

// The pane's rows: the header, the filter, the preview rule, up to three preview lines and the hint
// stand around the commands; the pane asks for that much more than the longest message.
const CHROME_ROWS = 8
const MIN_ROWS = 10
const MAX_ROWS = 30
/** How long after `/cc` returns the pane opens: the composer must be idle for the keys to be granted. */
const OPEN_DELAY_MS = 100

/** This session's register file, or undefined when the home directory is unknown. */
async function registerFile($: EngineInterface) {
  const home = await $.env.get('HOME')

  return home ? registerPath(home, await $.session.cwd(), await $.session.id()) : undefined
}

/**
 * Writes the register to this session's file, so it outlives the process (a background or a
 * restart of the session). A failure never reaches the caller: the register stays in memory and the
 * person is told once.
 */
async function save($: EngineInterface) {
  try {
    const path = await registerFile($)
    if (path === undefined) throw new Error('HOME is not set')
    await $.fs.write(path, registerText(await read($, commands)))
  } catch {
    if (await read($, saveWarned)) return
    await update($, saveWarned, () => true)
    $.ui.toast('Could not save the command register to disk: it stays in memory only.')
  }
}

/** Loads this session's file into an empty register, with the turn counter at its highest stored turn. */
async function restore($: EngineInterface) {
  try {
    if ((await read($, commands)).length > 0) return
    const path = await registerFile($)
    if (path === undefined) return
    const stored = parseRegister(await $.fs.read(path))
    if (stored.length === 0) return

    await update($, commands, () => stored)
    await update($, turn, n => Math.max(n, lastTurn(stored)))
  } catch {
    // A missing or unreadable file is an empty register.
  }
}

/** Copies command `n` (1-based) of the latest message and answers the line saying so, or why not. */
const copyNumber = async ($: EngineInterface, n: number) => {
  const latest = messagesOf(await read($, commands)).at(-1)
  if (latest === undefined) return EMPTY

  const command = latest.commands[n - 1]
  if (!command) return `There is no command #${n}: the latest message holds #1 to #${latest.commands.length}.`

  return copyCommand($, n, command.text)
}

/** Copies `text` as command `n` and answers the line saying so, or why not. */
const copyCommand = async ($: EngineInterface, n: number, text: string, surface?: RenderSurface) => {
  const copied = await $.ui.copy({ text, ...(surface === undefined ? {} : { surface }) })

  return copied.isCopied ? `Copied #${n}: ${firstLine(text)}` : `Could not copy #${n} (${copied.reason}).`
}

/** The index of the message the pane shows: the one at `turn`, the latest when none or when it is gone. */
const messageShown = (messages: readonly Message[], at: number | null) => {
  const index = messages.findIndex(message => message.turn === at)

  return index === -1 ? messages.length - 1 : index
}

/** Shows the message `delta` places away (-1 older, +1 newer), the end of the list stopping it. */
async function step($: EngineInterface, delta: number) {
  const messages = messagesOf(await read($, commands))
  const target = messages[messageShown(messages, await read($, shown)) + delta]
  if (target === undefined) return

  await update($, shown, () => target.turn)
  await update($, filter, () => '')
  await update($, focusKey, () => null)
}

/** Opens the pane on the keyboard, as tall as the longest message needs. */
async function openPane($: EngineInterface) {
  const messages = messagesOf(await read($, commands))
  if (messages.length === 0) return

  // Opening an id that is already open only retitles it and does not grant the keys: close it
  // first (a pane opened without the keys never got an Esc to close it).
  if ((await $.ui.panes()).some(pane => pane.id === PANE)) await $.ui.close({ id: PANE })

  const longest = Math.max(...messages.map(message => message.commands.length))
  await $.ui.open({
    id: PANE,
    title: 'Commands',
    focus: true,
    closeOnEscape: true,
    holdToasts: true,
    columns: 80,
    rows: Math.min(MAX_ROWS, Math.max(MIN_ROWS, longest + CHROME_ROWS)),
  })
}

/** Forgets what the last opening left: the message shown, the filter and the ring's place. */
async function reset($: EngineInterface) {
  await update($, shown, () => null)
  await update($, filter, () => '')
  await update($, focusKey, () => null)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'cc',
      immediate: true,
      description: 'Copy a shell command Claude gave: /cc opens the panel, /cc <n> copies command n of the latest message',
    })

    await restore($)

    return next(e)
  })

  // Each block of Claude's response is appended once, as it leaves the loop, so this sees every
  // text block of a turn (the text before a tool call too), where `turn.complete` carries only
  // the turn's final text. A subagent's blocks carry its `agentId` and are not the person's.
  on('session.append', { door: 'response' }, async ($, e, next) => {
    if (e.agentId !== undefined || e.message.role !== 'assistant') return next(e)

    const found = e.message.content.flatMap(block => (block.type === 'text' && typeof block.text === 'string' ? commandsIn(block.text) : []))
    if (found.length > 0) {
      const current = await read($, turn)
      await update($, commands, list =>
        // A row is registered once: a replayed append (a worker restarted mid-hook) adds nothing.
        list.some(command => command.row === e.uuid)
          ? list
          : [...list, ...found.map((text): Command => ({ turn: current, row: e.uuid, text }))],
      )
      await save($)
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  // A /clear ends the conversation the messages belong to; the next one starts over.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await update($, commands, () => [])
      await update($, turn, () => 0)
      await save($)
    }

    return next(e)
  })

  // Every prompt or command the person sends starts a new turn: what Claude answers to it is the
  // next message.
  on('prompt.submit', async ($, e, next) => {
    await update($, turn, n => n + 1)

    return next(e)
  }).catch(($, e, next) => next(e))

  // However the pane closes (Esc, the close mark, a copy), the next opening starts clean.
  on('ui.close', { id: PANE }, async ($, e, next) => {
    await reset($)

    return next(e)
  })

  on('command.run', { command: 'cc' }, async ($, e) => {
    const args = e.args.trim()

    if (args === '') {
      const messages = messagesOf(await read($, commands))
      if (messages.length === 0) return { text: EMPTY }

      await reset($)
      // The surface grants the keyboard only while the composer is idle and empty, which it is not
      // while this command runs: open once it has returned.
      $.clock.after(OPEN_DELAY_MS, () => {
        void openPane($)
      })

      return { text: OPENED }
    }
    if (!/^\d+$/.test(args)) return { text: USAGE }

    return { text: await copyNumber($, Number(args)) }
  })

  // The ring moves by the person's Tab, arrows or click: follow it so the marker and the preview
  // track the focused row.
  on('ui.focus', { component: 'Pane' }, async ($, e, next) => {
    const moved = await next(e)
    if (moved.deny === undefined && e.requestId === PANE) {
      await update($, focusKey, () => (e.plugin === 'command-register' && e.element !== undefined ? e.element : null))
    }

    return moved
  })

  // The pane: the header, the filter, the shown message's commands (each a Button, its digit the
  // hotkey), the focused command whole and a hint.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Input, Text } = $.ui.resolve(e)
    const messages = messagesOf(await read($, commands))
    const inner = Math.max(20, e.props.bodyColumns)

    if (messages.length === 0) return <Text dimColor>{EMPTY}</Text>

    const at = messageShown(messages, await read($, shown))
    const message = messages[at]!
    const text = await read($, filter)
    const focused = await read($, focusKey)
    const matches = visible(message.commands, text)

    // The preview takes up to three lines in a tall pane, one in a short one. The rows left over
    // are the commands'; a longer message is narrowed by the filter, and the engine arms no digit
    // of a row scrolled out of view.
    const previewRoom = matches.length === 0 ? 0 : e.props.scroll.bodyRows >= 14 ? 3 : 1
    const room = Math.max(1, e.props.scroll.bodyRows - 5 - previewRoom)
    const rows = matches.slice(0, room)
    const selected = rows.find(row => `command:${row.n}` === focused) ?? rows[0]
    const preview = selected === undefined ? [] : previewLines(selected.text, inner, previewRoom)

    const pick = (n: number, command: string) => async (press: { surface: RenderSurface }) => {
      const said = await copyCommand($, n, command, press.surface)
      await $.ui.close({ id: PANE })
      $.ui.toast(said)
    }

    return (
      <Box flexDirection="column">
        <Box key="head">
          <Text bold color="suggestion">{'Commands  '}</Text>
          <Button key="older" plain hotkey="h" dimColor={at === 0} label="‹" onPress={() => step($, -1)} />
          <Text>{` message ${at + 1} of ${messages.length} `}</Text>
          <Button key="newer" plain hotkey="l" dimColor={at === messages.length - 1} label="›" onPress={() => step($, 1)} />
        </Box>
        <Input
          key="filter"
          label="filter: "
          placeholder="type to filter"
          value={text}
          submitLabel="copy"
          onInput={value => update($, filter, () => value)}
          onSubmit={async (value, press) => {
            const first = visible(message.commands, value)[0]
            if (first === undefined) return
            await pick(first.n, first.text)(press)
          }}
        />
        {rows.length === 0 && <Text dimColor>{`No command matches "${text}"`}</Text>}
        {rows.map(({ n, text: command }, i) => (
          <Box key={`row:${n}`}>
            <Text color="suggestion">{selected?.n === n ? '▶ ' : '  '}</Text>
            <Button
              key={`command:${n}`}
              plain
              {...(i < 9 ? { hotkey: String(i + 1) } : {})}
              label={rowLabel(i < 9 ? command : `${n}: ${command}`, inner - 5)}
              onPress={pick(n, command)}
            />
          </Box>
        ))}
        {matches.length > rows.length && <Text dimColor>{`+${matches.length - rows.length} more: type to filter`}</Text>}
        {selected !== undefined && (
          <>
            <Text dimColor>{previewRule(inner)}</Text>
            <Box key="preview" flexDirection="column">
              {preview.map((line, i) => (
                <Text key={`line:${i}`}>{line}</Text>
              ))}
            </Box>
          </>
        )}
        <Box key="hint">
          <Text dimColor>{hintText(inner, e.props.isFocused)}</Text>
        </Box>
      </Box>
    )
  })
}
