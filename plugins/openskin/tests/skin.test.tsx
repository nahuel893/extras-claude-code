import { expect, test } from 'claude-code/testing'
import { PRESETS } from '../hooks/skin'
import { THEME_DEFAULTS, UNSKINNED } from '../hooks/theme'

const COLOR_FIELDS = Object.keys(THEME_DEFAULTS)
  .filter(field => !(UNSKINNED as readonly string[]).includes(field))
  .sort()
const NAMES = Object.keys(PRESETS)

/** `/skin <args>` as the person types it at the prompt, the way the engine raises it. */
const typed = (args: string) =>
  ({ command: 'skin', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } }) as const

test('every preset sets every color option but the panel background, and a dark or light theme; default is the manifest defaults', async () => {
  expect(NAMES).toEqual([
    'default',
    'tokyonight',
    'catppuccin-mocha',
    'catppuccin-latte',
    'gruvbox-dark',
    'nord',
    'rose-pine',
    'rose-pine-dawn',
    'kanagawa-wave',
    'everforest',
    'one-dark',
  ])
  for (const preset of Object.values(PRESETS)) {
    const { theme, ...colors } = preset
    expect(['dark', 'light']).toContain(theme)
    expect(Object.keys(colors).sort()).toEqual(COLOR_FIELDS)
  }
  const { panelBackground: _, ...skinned } = THEME_DEFAULTS
  expect(PRESETS.default).toEqual({ theme: 'dark', ...skinned })
})

test('with the status panel off, /skin is registered at the start of an interactive session', { options: { statusPanel: false } }, async ($, on) => {
  const registered: string[] = []
  on('command.register', ($, e) => {
    registered.push(e.name)
    return { value: { command: e.name } }
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: true })

  expect(registered).toEqual(['skin'])
})

test('with the status panel on, /skin and /panel are both registered', async ($, on) => {
  const registered: string[] = []
  on('env.get', () => ({ value: '/home/test' }))
  on('session.id', () => ({ value: 'session-1' }))
  on('fs.stat', () => ({ deny: 'no input yet' }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('store.get', () => ({ value: undefined }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] } }))
  on('command.register', ($, e) => {
    registered.push(e.name)
    return { value: { command: e.name } }
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: true })

  expect(registered.sort()).toEqual(['panel', 'skin'])
})

test('/skin <name> sets the theme and every color option of that preset', async ($, on) => {
  const sets: Record<string, unknown> = {}
  on('config.set', ($, e) => {
    sets[e.key] = e.value
    return { value: e.value }
  })

  const { text } = await $.command.run(typed(' Nord '))

  expect(sets).toEqual({
    theme: 'dark',
    'openskin.accent': '#88c0d0',
    'openskin.surface': '#3b4252',
    'openskin.toolBar': '#4c566a',
    'openskin.error': '#bf616a',
    'openskin.muted': '#81a1c1',
    'openskin.command': '#a3be8c',
    'openskin.background': '#2e3440',
  })
  expect(text).toMatch(/nord/)
})

test('a light preset switches Claude Code to its light theme', async ($, on) => {
  const sets: Record<string, unknown> = {}
  on('config.set', ($, e) => {
    sets[e.key] = e.value
    return { value: e.value }
  })

  await $.command.run(typed('catppuccin-latte'))

  expect(sets.theme).toBe('light')
  expect(sets['openskin.background']).toBe('#e6e9ef')
})

test('/skin alone lists every preset and changes nothing', async ($, on) => {
  const sets: string[] = []
  on('config.set', ($, e) => {
    sets.push(e.key)
    return { value: e.value }
  })

  const { text } = await $.command.run(typed(''))

  for (const name of NAMES) expect(text).toContain(name)
  expect(text).toContain('/skin <name>')
  expect(sets).toEqual([])
})

test('an unknown preset is named back with the list, and nothing changes', async ($, on) => {
  const sets: string[] = []
  on('config.set', ($, e) => {
    sets.push(e.key)
    return { value: e.value }
  })

  const { text } = await $.command.run(typed('solarized'))

  expect(text).toContain('solarized')
  for (const name of NAMES) expect(text).toContain(name)
  expect(sets).toEqual([])
})

test('a refused option is reported, the rest still applied', async ($, on) => {
  const sets: string[] = []
  on('config.set', ($, e) => {
    if (e.key === 'theme') return { deny: 'set by managed settings' }
    sets.push(e.key)
    return { value: e.value }
  })

  const { text } = await $.command.run(typed('tokyonight'))

  expect(sets).toHaveLength(7)
  expect(text).toContain('theme')
  expect(text).toContain('set by managed settings')
})
