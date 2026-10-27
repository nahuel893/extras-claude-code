import { mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, PaneOpenArgs } from 'claude-code'

/** The wait the mod puts between the command returning and the pane opening. */
const OPEN_DELAY_MS = 100

/** The `/cc` pane as the surface hands it to the mod's `ui.render` hook (docked, with the keys). */
export const pane = (bodyRows = 30, bodyColumns = 80, isFocused = true) =>
  ({
    plugin: 'command-register',
    component: 'Pane',
    requestId: 'cc',
    surface: 'terminal',
    props: {
      title: 'Commands',
      isFocused,
      bodyColumns,
      placement: 'dock',
      scroll: { offset: 0, bodyRows },
      view: {},
    },
  }) as const

/** A block of Claude's reply as the engine appends it to the main conversation (or a subagent's). */
export const reply = (uuid: string, text: string, agentId?: string) => ({
  message: { type: 'assistant' as const, role: 'assistant' as const, content: [{ type: 'text' as const, text }] },
  door: 'response' as const,
  origin: { kind: 'model' as const, model: 'claude-opus-5-5' },
  uuid,
  ...(agentId === undefined ? {} : { agentId }),
})

/**
 * Stands in for the engine beneath the mod: the command registration, the clipboard (whose writes
 * it keeps so a test reads what `/cc` copied) and the pane (the opens and closes it was asked for).
 * The register is read back through `/cc <n>`, as the person reads it: the kit's `$.state` is the
 * mod's alone.
 */
export const engine = async ($: Engine, on: On, clipboard: { isCopied: true } | { isCopied: false; reason: string } = { isCopied: true }) => {
  const clock = mock.clock(on, { now: 0 })
  const copied: string[] = []
  const toasts: string[] = []
  const opened: PaneOpenArgs[] = []
  const closed: string[] = []
  const open = new Set<string>()
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.open', (_, e) => {
    opened.push(e)
    open.add(e.id)
    return { value: { isPlaced: true as const } }
  })
  on('ui.close', (_, e) => {
    closed.push(e.id)
    open.delete(e.id)
    return { value: undefined }
  })
  on('ui.panes', () => ({ value: [...open].map(id => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })) }))
  // The engine draws nothing of its own in the pane: the mod owns its whole body.
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  on('ui.focus', () => ({ value: {} }))
  on('ui.copy', (_, e) => {
    copied.push(e.text)
    return { value: clipboard }
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  return {
    copied,
    toasts,
    opened,
    closed,
    clock,
    /** Runs `/cc <args>` and answers its output line, the command having returned and no time passed. */
    ccNow: async (args = '') => (await $.command.run({ command: 'cc', args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } })).text,
    /** Runs `/cc <args>`, then lets the pane open as it does once the command has returned. */
    cc: async (args = '') => {
      const { text } = await $.command.run({ command: 'cc', args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } })
      await clock.advance(OPEN_DELAY_MS)
      return text
    },
  }
}
