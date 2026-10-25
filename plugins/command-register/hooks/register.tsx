import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderSurface } from 'claude-code'
import type { Command } from '../types'
import { commandsIn } from './commands'

/**
 * The register, oldest first: a command's number is its place + 1. Change the tag when a
 * command's fields change: it declines what an earlier version stored, which outlives a reload.
 */
const commands = atom({ plugin: 'command-register', key: 'commands' } as const, [], { shape: 'commands-1' })

/** Whether `/cc` has the list open in the band above the prompt. */
const isOpen = atom({ plugin: 'command-register', key: 'isOpen' } as const, false)

const EMPTY = 'No shell commands yet: the register fills as Claude gives them.'
const USAGE = 'Usage: /cc to pick from the list, or /cc <n> to copy command n.'
const OPENED = "Command list open above the prompt: press a row's digit to copy it."

/** The command's first line, as a notice or a list row names it. */
export const firstLine = (text: string) => text.split('\n').find(line => line.trim())?.trim() ?? ''

/**
 * A list row's label: the number and the command's first line, ` …` when more lines follow,
 * cut to the band's width and with control characters (a tab) drawn as spaces, which a label refuses.
 */
export const rowLabel = (n: number, text: string, columns: number) => {
  const first = firstLine(text).replace(/[\u0000-\u001f\u007f]/g, ' ')
  const label = `#${n}  ${first}${text.trim().includes('\n') ? ' …' : ''}`
  const room = Math.max(12, columns)

  return label.length > room ? `${label.slice(0, room - 1)}…` : label
}

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
    await update($, isOpen, () => false)

    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'cc' }, async ($, e) => {
    const args = e.args.trim()

    if (args === '') {
      if ((await read($, commands)).length === 0) return { text: EMPTY }
      await update($, isOpen, () => true)

      return { text: OPENED }
    }
    if (!/^\d+$/.test(args)) return { text: USAGE }

    return { text: await copyNumber($, Number(args)) }
  })

  // The list, newest first, above whatever else the band holds. Each row is one Button with its
  // digit as hotkey: a bare digit in the empty prompt presses a band Button, so `/cc` then `1`
  // copies the newest command with no focus step. The person's ring (ctrl+x tab, then Tab or the
  // arrows) walks the rows too, and Enter presses one.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // A survey holds the band (its digits are the person's answer): the list waits for it.
    if (e.props.hasSurvey || !(await read($, isOpen))) return next(e)

    const list = await read($, commands)
    if (list.length === 0) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const pick = (n: number) => async (press: { surface: RenderSurface }) => {
      const said = await copyNumber($, n, press.surface)
      await update($, isOpen, () => false)
      $.ui.toast(said)
    }
    // Nine digits, and no more rows than the band holds whole beside the hint and close rows: a
    // taller tree scrolls, and the engine arms no digit of a row scrolled out of view.
    const shown = Math.max(1, Math.min(9, e.props.maxRows - 2))
    const rows = list
      .map((command, i) => ({ n: i + 1, text: command.text }))
      .reverse()
      .slice(0, shown)
    const older = list.length - rows.length

    return (
      <Box flexDirection="column">
        <Box flexDirection="column">
          <Text dimColor>Copy a command: press its digit, 0 closes</Text>
          {rows.map(({ n, text }, i) => (
            <Button
              key={`command:${n}`}
              plain
              hotkey={String(i + 1)}
              label={rowLabel(n, text, e.props.bodyColumns - 4)}
              onPress={pick(n)}
            />
          ))}
          <Box>
            <Button key="close" plain dimColor hotkey="0" label="close" onPress={() => update($, isOpen, () => false)} />
            {older > 0 && <Text dimColor>{`   older ${older === 1 ? '#1' : `#1-#${older}`}: /cc <n>`}</Text>}
          </Box>
        </Box>
        {await next(e)}
      </Box>
    )
  })
}
