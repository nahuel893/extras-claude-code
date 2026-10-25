import type { PluginOptions } from 'claude-code'

/** Every color the mod draws with, as the manifest's `userConfig` names them. */
export const THEME_DEFAULTS = {
  accent: '#f0a6ec',
  surface: '#24242c',
  toolBar: '#55555f',
  error: '#ff6b5b',
  muted: '#7f7f8a',
  command: 'bashBorder',
  /** The band behind each reply; `none` draws it unpainted (see `paint`). */
  background: '#1c1c22',
}

export type Theme = typeof THEME_DEFAULTS

/** Reads each color option once, trimmed; an empty or missing one keeps its default. */
export const readTheme = (options: PluginOptions): Theme => {
  const theme = { ...THEME_DEFAULTS }

  for (const name of Object.keys(theme) as (keyof Theme)[]) {
    const value = options[name]
    if (typeof value === 'string' && value.trim()) theme[name] = value.trim()
  }
  return theme
}

/**
 * A color as a `backgroundColor` prop: `none` (any case) is no color at all, so the box
 * is left out of the painting rather than handed a value the surface would reject.
 */
export const paint = (color: string): string | undefined => (color.toLowerCase() === 'none' ? undefined : color)

/** The two parts of the mod, each one its own switch in the manifest. */
export type Switches = { opencodeStyle: boolean; commandFrames: boolean }

/** A part is on unless its option is explicitly `false`, so a missing value keeps the default look. */
export const readSwitches = (options: PluginOptions): Switches => ({
  opencodeStyle: options.opencodeStyle !== false,
  commandFrames: options.commandFrames !== false,
})
