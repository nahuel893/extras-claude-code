import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

/** The band above the prompt as the terminal hands it to the mod's `ui.render` hook. */
export const band = (maxRows = 14) =>
  ({
    plugin: 'command-register',
    component: 'AbovePrompt',
    requestId: 'above-prompt',
    surface: 'terminal',
    props: {
      hasSurvey: false,
      isWorking: false,
      maxRows,
      bodyColumns: 100,
      scroll: { offset: 0, bodyRows: maxRows - 1 },
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
 * Stands in for the engine beneath the mod: the command registration and the clipboard, whose
 * writes it keeps so a test reads what `/cc` copied. The register is read back through `/cc <n>`,
 * as the person reads it: the kit's `$.state` is the mod's alone.
 */
export const engine = async ($: Engine, on: On) => {
  const copied: string[] = []
  const toasts: string[] = []
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  // What the engine (or a plugin beneath) draws in the band: the list must keep it.
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
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
    /** Runs `/cc <args>` and answers its output line. */
    cc: async (args = '') => (await $.command.run({ command: 'cc', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })).text,
  }
}
