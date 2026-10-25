import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderSurface } from 'claude-code'
import type { Command } from '../types'
import { commandsIn } from './commands'
import { firstLine, hintText, previewLines, previewRule, rowLabel, visible } from './dialog'

/**
 * The register, oldest first: a command's number is its place + 1. Change the tag when a
 * command's fields change: it declines what an earlier version stored, which outlives a reload.
 */
const commands = atom({ plugin: 'command-register', key: 'commands' } as const, [], { shape: 'commands-1' })

/** Whether `/cc` has the list open in the band above the prompt. */
const isOpen = atom({ plugin: 'command-register', key: 'isOpen' } as const, false)

/** The key of the band element holding the focus ring, when the band holds the keyboard. */
const focusKey = atom({ plugin: 'command-register', key: 'focusKey' } as const, null)

/** What the person typed in the list's filter. */
const filter = atom({ plugin: 'command-register', key: 'filter' } as const, '')

const EMPTY = 'No shell commands yet: the register fills as Claude gives them.'
const USAGE = 'Usage: /cc to pick from the list, or /cc <n> to copy command n.'
const OPENED = "Command list open above the prompt: press a row's digit to copy it."

/** Copies command `n` (1-based) and answers the line saying so, or why not. */
const copyNumber = async ($: EngineInterface, n: number, surface?: RenderSurface) => {
  const list = await read($, commands)
  if (list.length === 0) return EMPTY

  const command = list[n - 1]
  if (!command) return `There is no command #${n}: the register holds #1 to #${list.length}.`

  const copied = await $.ui.copy({ text: command.text, ...(surface === undefined ? {} : { surface }) })

  return copied.isCopied
    ? `Copied #${n}: ${firstLine(command.text)}`
    : `Could not copy #${n} (${copied.reason}).`
}

/** Shuts the list and forgets the filter and the ring's place. */
async function closeList($: EngineInterface) {
  await update($, isOpen, () => false)
  await update($, filter, () => '')
  await update($, focusKey, () => null)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'cc',
      description: 'Copy a shell command Claude gave: /cc lists them, /cc <n> copies command n',
    })

    return next(e)
  })

  // Each block of Claude's response is appended once, as it leaves the loop, so this sees every
  // text block of a turn (the text before a tool call too), where `turn.complete` carries only
  // the turn's final text. A subagent's blocks carry its `agentId` and are not the person's.
  on('session.append', { door: 'response' }, async ($, e, next) => {
    if (e.agentId !== undefined || e.message.role !== 'assistant') return next(e)

    const found = e.message.content.flatMap(block => (block.type === 'text' && typeof block.text === 'string' ? commandsIn(block.text) : []))
    if (found.length > 0) {
      await update($, commands, list =>
        // A row is registered once: a replayed append (a worker restarted mid-hook) adds nothing.
        list.some(command => command.row === e.uuid)
          ? list
          : [...list, ...found.map((text): Command => ({ row: e.uuid, text }))],
      )
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  // A /clear ends the conversation the numbers point into; the next one starts at #1.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') await update($, commands, () => [])

    return next(e)
  })

  // Every prompt or command the person sends shuts the list: the band has no word of Esc (it hands
  // the keys back to the prompt and raises nothing), so going back to the prompt is the dismissal.
  // `/cc` itself passes here first and opens the list again at `command.run`.
  on('prompt.submit', async ($, e, next) => {
    await closeList($)

    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'cc' }, async ($, e) => {
    const args = e.args.trim()

    if (args === '') {
      if ((await read($, commands)).length === 0) return { text: EMPTY }
      await closeList($)
      await update($, isOpen, () => true)

      return { text: OPENED }
    }
    if (!/^\d+$/.test(args)) return { text: USAGE }

    return { text: await copyNumber($, Number(args)) }
  })

  // The ring moves by the person's Tab, arrows or click once the band holds the keyboard: follow it
  // so the marker and the preview track the focused row, and the hint knows the band has the keys.
  on('ui.focus', { component: 'AbovePrompt' }, async ($, e, next) => {
    const moved = await next(e)
    if (moved.deny === undefined) {
      await update($, focusKey, () => (e.plugin === 'command-register' && e.element !== undefined ? e.element : null))
    }

    return moved
  })

  // The dialog, above whatever else the band holds: a rounded frame, the filter, up to nine rows
  // (each a Button with its digit as hotkey: a bare digit in the empty prompt presses it with no
  // focus step), the selected command whole, and a hint that depends on who holds the keyboard.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // A survey holds the band (its digits are the person's answer): the list waits for it.
    if (e.props.hasSurvey || !(await read($, isOpen))) return next(e)

    const list = await read($, commands)
    if (list.length === 0) return next(e)

    const { Box, Button, Input, Text } = $.ui.resolve(e)
    const text = await read($, filter)
    const focused = await read($, focusKey)
    const matches = visible(list, text)

    const inner = Math.max(20, e.props.bodyColumns - 4)
    // Frame (2), filter (1), preview rule (1) and hint (1) are fixed; the preview takes up to three
    // lines in a tall band, one in a short one. A taller tree scrolls, and the engine arms no digit
    // of a row scrolled out of view.
    const previewRoom = matches.length === 0 ? 0 : e.props.maxRows >= 14 ? 3 : 1
    const shown = Math.max(1, Math.min(9, matches.length, e.props.maxRows - 5 - previewRoom))
    const rows = matches.slice(0, shown)
    const selected = rows.find(row => `command:${row.n}` === focused) ?? rows[0]
    const isFocused = focused !== null
    const preview = selected === undefined ? [] : previewLines(selected.text, inner, previewRoom)

    const pick = (n: number) => async (press: { surface: RenderSurface }) => {
      const said = await copyNumber($, n, press.surface)
      await closeList($)
      $.ui.toast(said)
    }

    return (
      <Box flexDirection="column">
        <Box flexDirection="column">
          <Box borderStyle="round" borderColor="promptBorder" paddingX={1} flexDirection="column">
            <Input
              key="filter"
              label="filter: "
              placeholder="type to filter"
              value={text}
              submitLabel="copy"
              onInput={value => update($, filter, () => value)}
              onSubmit={async (value, press) => {
                const first = visible(list, value)[0]
                if (first === undefined) return
                await pick(first.n)(press)
              }}
            />
            {rows.length === 0 && <Text dimColor>{`No command matches "${text}"`}</Text>}
            {rows.map(({ n, text: command }, i) => (
              <Box key={`row:${n}`}>
                <Text color="suggestion">{selected?.n === n ? '▶ ' : '  '}</Text>
                <Button
                  key={`command:${n}`}
                  plain
                  hotkey={String(i + 1)}
                  label={rowLabel(command, inner - 7)}
                  onPress={pick(n)}
                />
              </Box>
            ))}
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
              <Text dimColor>{hintText(isFocused, inner)}</Text>
              <Button key="close" plain dimColor hotkey="0" label="close" onPress={() => closeList($)} />
            </Box>
          </Box>
          <Box position="absolute" top={0} left={2}>
            <Text bold color="suggestion">{' Commands '}</Text>
          </Box>
          <Box position="absolute" top={0} right={2}>
            <Text dimColor>{` ${rows.length} of ${list.length} `}</Text>
          </Box>
        </Box>
        {await next(e)}
      </Box>
    )
  })
}
