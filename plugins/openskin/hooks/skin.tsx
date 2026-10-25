import type { EngineInterface, On } from 'claude-code'
import { THEME_DEFAULTS, type Theme, UNSKINNED } from './theme'

/**
 * A color preset: every openskin color option but those the person keeps whatever the preset
 * (UNSKINNED), plus Claude Code's own `theme` to match.
 */
export type Preset = Omit<Theme, (typeof UNSKINNED)[number]> & { theme: 'dark' | 'light' }

const { panelBackground: _, ...SKINNED_DEFAULTS } = THEME_DEFAULTS

/** The presets `/skin` applies, in the order it lists them. */
export const PRESETS: Record<string, Preset> = {
  default: { theme: 'dark', ...SKINNED_DEFAULTS },
  tokyonight: { theme: 'dark', accent: '#bb9af7', surface: '#1f2335', toolBar: '#414868', error: '#f7768e', muted: '#737aa2', command: '#7dcfff', background: '#16161e' },
  'catppuccin-mocha': { theme: 'dark', accent: '#cba6f7', surface: '#313244', toolBar: '#585b70', error: '#f38ba8', muted: '#9399b2', command: '#94e2d5', background: '#181825' },
  'catppuccin-latte': { theme: 'light', accent: '#8839ef', surface: '#ccd0da', toolBar: '#acb0be', error: '#d20f39', muted: '#5c5f77', command: '#179299', background: '#e6e9ef' },
  'gruvbox-dark': { theme: 'dark', accent: '#fabd2f', surface: '#3c3836', toolBar: '#665c54', error: '#fb4934', muted: '#a89984', command: '#8ec07c', background: '#1d2021' },
  nord: { theme: 'dark', accent: '#88c0d0', surface: '#3b4252', toolBar: '#4c566a', error: '#bf616a', muted: '#81a1c1', command: '#a3be8c', background: '#2e3440' },
  'rose-pine': { theme: 'dark', accent: '#c4a7e7', surface: '#26233a', toolBar: '#403d52', error: '#eb6f92', muted: '#908caa', command: '#9ccfd8', background: '#191724' },
  'rose-pine-dawn': { theme: 'light', accent: '#907aa9', surface: '#f2e9e1', toolBar: '#cecacd', error: '#b4637a', muted: '#797593', command: '#56949f', background: '#faf4ed' },
  'kanagawa-wave': { theme: 'dark', accent: '#d27e99', surface: '#2a2a37', toolBar: '#54546d', error: '#e46876', muted: '#938aa9', command: '#7fb4ca', background: '#16161d' },
  everforest: { theme: 'dark', accent: '#a7c080', surface: '#343f44', toolBar: '#475258', error: '#e67e80', muted: '#9da9a0', command: '#83c092', background: '#232a2e' },
  'one-dark': { theme: 'dark', accent: '#61afef', surface: '#2c313c', toolBar: '#3e4451', error: '#e06c75', muted: '#828997', command: '#56b6c2', background: '#21252b' },
}

const presetList = () =>
  Object.entries(PRESETS)
    .map(([name, preset]) => `  ${name} (${preset.theme})`)
    .join('\n')

/**
 * Sets Claude Code's theme first (a row of its own, no reload), then each openskin color
 * option, which reloads the mod with the new colors. A refused row is named, the rest applied.
 */
async function applyPreset($: EngineInterface, name: string, preset: Preset) {
  const { theme, ...colors } = preset
  const rows: [string, string][] = [['theme', theme], ...Object.entries(colors).map(([field, value]): [string, string] => [`openskin.${field}`, value])]
  const refused: string[] = []

  for (const [key, value] of rows) {
    const { deny } = await $.config.set({ key, value })
    if (deny !== undefined) refused.push(`${key} (${deny})`)
  }

  if (refused.length === 0) return `Applied the ${name} preset with Claude Code's ${theme} theme.`
  return `Applied the ${name} preset, except: ${refused.join(', ')}.`
}

/**
 * `/skin`: lists the presets, and `/skin <name>` applies one. The command is registered at
 * the start of an interactive session; the matcher keeps this `session.start` apart from the
 * status panel's, as a module may hook an event only once without one.
 */
export const registerSkin = (on: On) => {
  on('session.start', { isInteractive: true }, async ($, e, next) => {
    await $.command.register({ name: 'skin', description: "Switch openskin's colors to a preset", argumentHint: '[preset]' })
    return next(e)
  })

  on('command.run', { command: 'skin' }, async ($, e) => {
    const name = e.args.trim().toLowerCase()

    if (!name) return { text: `Presets:\n${presetList()}\nRun /skin <name> to apply one.` }

    const preset = PRESETS[name]
    if (!preset) return { text: `No preset named "${name}". Presets:\n${presetList()}` }

    return { text: await applyPreset($, name, preset) }
  })
}
