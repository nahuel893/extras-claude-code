import type { Register } from 'claude-code'
import { drawFramedCommands, SHELL_FENCE_RULE, splitCommands, type Segment } from './commands'
import { drawReply, drawSummary, registerOpencode } from './opencode'
import { registerSkin } from './skin'
import { registerStatusPanel } from './statusline'
import { readSwitches, readTheme } from './theme'

export { splitCommands } from './commands'
export { formatDuration, formatModel } from './opencode'
export { color256, outputLines, panelRows, parseAnsi } from './statusline'

/** A reply kept whole, its shell blocks left in the markdown, for when commands are not framed. */
const asProse = (text: string): Segment[] => (text.trim() ? [{ kind: 'prose', text: text.trim() }] : [])

export const register: Register = (on, options) => {
  const theme = readTheme(options)
  const { opencodeStyle, commandFrames } = readSwitches(options)

  if (commandFrames) {
    on('prompt.compose', async ($, e, next) => {
      const { sections } = await next(e)

      return { sections: [...sections, SHELL_FENCE_RULE] }
    })
  }

  if (opencodeStyle) registerOpencode(on, theme)

  // The status band above the prompt has its own switch, on unless explicitly false.
  if (options.statusPanel !== false) registerStatusPanel(on, theme, options)

  // /skin switches every color at once, whichever parts are on.
  registerSkin(on)

  // With both parts off the engine draws every reply as it would without the mod.
  if (!opencodeStyle && !commandFrames) return

  // The reply and its command frames live in one hook: two mods redrawing the same
  // message have no fixed order, so a separate frame mod could sit beneath and never run.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const ui = $.ui.resolve(e)

    if (opencodeStyle) {
      if (e.props.isSummary) return drawSummary(ui, await next({ ...e, props: { ...e.props, isFirstOfReply: false } }))

      return drawReply(ui, theme, commandFrames ? splitCommands(e.props.text) : asProse(e.props.text))
    }

    // Commands framed in the engine's own transcript: a summary or a reply with no
    // command is the engine's alone, and only the reply's first piece keeps its bullet.
    if (e.props.isSummary) return next(e)

    const segments = splitCommands(e.props.text)
    if (!segments.some(segment => segment.kind === 'command')) return next(e)

    return drawFramedCommands(ui, theme, segments, (text, i) =>
      next({ ...e, props: { ...e.props, text, isFirstOfReply: i === 0 && e.props.isFirstOfReply } }),
    )
  })
}
