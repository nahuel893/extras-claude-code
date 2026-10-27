import type { Engine } from 'claude-code/testing'
import type { On, PaneOpenArgs } from 'claude-code'

/** The `/cc` pane as the surface hands it to the mod's `ui.render` hook (docked, with the keys). */
export const pane = (bodyRows = 30, bodyColumns = 80) =>
  ({
    plugin: 'command-register',
    component: 'Pane',
    requestId: 'cc',
    surface: 'terminal',
    props: {
      title: 'Commands',
      isFocused: true,
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
export const engine = async ($: Engine, on: On) => {
  const copied: string[] = []
  const toasts: string[] = []
  const opened: PaneOpenArgs[] = []
  const closed: string[] = []
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
    return { value: { isPlaced: true as const } }
  })
  on('ui.close', (_, e) => {
    closed.push(e.id)
    return { value: undefined }
  })
  // The engine draws nothing of its own in the pane: the mod owns its whole body.
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  on('ui.focus', () => ({ value: {} }))
  on('ui.copy', (_, e) => {
    copied.push(e.text)
    return { value: { isCopied: true as const } }
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  return {
    copied,
    toasts,
    opened,
    closed,
    /** Runs `/cc <args>` and answers its output line. */
    cc: async (args = '') => (await $.command.run({ command: 'cc', args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } })).text,
  }
}
