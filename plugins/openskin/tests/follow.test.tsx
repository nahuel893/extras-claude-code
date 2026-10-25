import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { driftedKeys, ownOptions } from '../hooks/follow'
import { THEME_DEFAULTS } from '../hooks/theme'

const HOME = '/home/test'
const SETTINGS = `${HOME}/.claude/settings.json`
const TICK = 1500

/** The options a session registered openskin with in these tests: the manifest's defaults, panel off. */
const OPTIONS = { statusPanel: false } as const
const REGISTERED = { ...THEME_DEFAULTS, statusPanel: false }

/** A settings file holding openskin's options under its installed id, and Claude Code's theme. */
const settings = (options: Record<string, unknown>, theme = 'dark') =>
  JSON.stringify({ theme, pluginConfigs: { 'openskin@extras-claude-code': { options } }, permissions: { allow: [] } }, null, 2)

/**
 * Everything beneath the mod: the clock, the home, the session id, a store, a file system in memory
 * (a new mtime per write), the `/config` theme row, and a record of the commands and settings the mod runs.
 */
function world(on: On, env: Record<string, string> = { HOME }) {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, env)
  mock.store(on)
  const files = new Map<string, { text: string; mtimeMs: number }>()
  const reloads: string[] = []
  const sets: Record<string, unknown> = {}
  let writes = 0
  let theme = 'dark'
  on('session.id', () => ({ value: 'session-1' }))
  on('fs.stat', ($, e) => {
    const file = files.get(e.path)
    return file ? { value: { kind: 'file', size: file.text.length, mtimeMs: file.mtimeMs, isLink: true } } : { deny: `ENOENT: ${e.path}` }
  })
  on('fs.read', ($, e) => {
    const file = files.get(e.path)
    return file ? { value: file.text } : { deny: `ENOENT: ${e.path}` }
  })
  on('config.list', () => ({
    value: [{ key: 'theme', label: 'Theme', kind: 'choice', value: theme, provider: { plugin: 'engine', tier: 'core' }, isLocked: false }] as never,
  }))
  on('config.set', ($, e) => {
    sets[e.key] = e.value
    return { value: e.value }
  })
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('command.run', { command: 'reload-plugins' }, ($, e) => {
    reloads.push(e.command)
    return { text: 'Reloaded.' }
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))

  return {
    clock,
    reloads,
    sets,
    write: (path: string, text: string) => files.set(path, { text, mtimeMs: ++writes }),
    setTheme: (value: string) => {
      theme = value
    },
  }
}

const startSession = ($: Engine) => $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: true })

test("openskin's options are read from its installed id, whatever the marketplace", async () => {
  expect(ownOptions({ pluginConfigs: { 'openskin@extras-claude-code': { options: { accent: '#fff' } } } })).toEqual({ accent: '#fff' })
  expect(ownOptions({ pluginConfigs: { openskin: { options: { accent: '#000' } } } })).toEqual({ accent: '#000' })
  expect(ownOptions({ pluginConfigs: { 'other@x': { options: { accent: '#000' } } } })).toBeUndefined()
  expect(ownOptions({})).toBeUndefined()
  expect(ownOptions(null)).toBeUndefined()
})

test('only the options whose values differ from the registered ones drift', async () => {
  expect(driftedKeys({ accent: THEME_DEFAULTS.accent, panelBackground: '#1a1b26' }, REGISTERED)).toEqual(['panelBackground'])
  expect(driftedKeys({ accent: THEME_DEFAULTS.accent }, REGISTERED)).toEqual([])
  expect(driftedKeys({}, REGISTERED)).toEqual([])
})

test("an edit of openskin's options outside the session reloads it, once, within a couple of ticks", { options: OPTIONS }, async ($, on) => {
  const w = world(on)
  w.write(SETTINGS, settings({ ...THEME_DEFAULTS }))
  await startSession($)
  await w.clock.advance(TICK * 3)
  expect(w.reloads).toEqual([])

  // A desktop theme script rewrites the file: the panel background and the accent change.
  w.write(SETTINGS, settings({ ...THEME_DEFAULTS, accent: '#bb9af7', panelBackground: '#1a1b26' }))
  // One tick waits for Claude Code's own reload, the next asks for one.
  await w.clock.advance(TICK * 2 + 1)
  expect(w.reloads).toEqual(['reload-plugins'])

  // Nothing is written to settings, and the same drift is not reloaded again.
  await w.clock.advance(TICK * 10)
  expect(w.reloads).toEqual(['reload-plugins'])
  expect(w.sets).toEqual({})
})

test('a file rewritten with the values openskin already has changes nothing', { options: OPTIONS }, async ($, on) => {
  const w = world(on)
  w.write(SETTINGS, settings({ accent: THEME_DEFAULTS.accent }))
  await startSession($)
  await w.clock.advance(TICK * 2)

  w.write(SETTINGS, settings({ accent: THEME_DEFAULTS.accent, panelBackground: 'none' }))
  await w.clock.advance(TICK * 4)

  expect(w.reloads).toEqual([])
  expect(w.sets).toEqual({})
})

test("a theme changed outside the session, which Claude Code still shows as before, reloads too", { options: OPTIONS }, async ($, on) => {
  const w = world(on)
  w.write(SETTINGS, settings({}, 'dark'))
  await startSession($)
  await w.clock.advance(TICK * 2)

  w.write(SETTINGS, settings({}, 'light'))
  // One tick waits for Claude Code's own reload, the next asks for one.
  await w.clock.advance(TICK * 2 + 1)
  expect(w.reloads).toEqual(['reload-plugins'])
})

test('a theme Claude Code already follows changes nothing', { options: OPTIONS }, async ($, on) => {
  const w = world(on)
  w.write(SETTINGS, settings({}, 'dark'))
  await startSession($)
  await w.clock.advance(TICK * 2)

  w.setTheme('light')
  w.write(SETTINGS, settings({}, 'light'))
  await w.clock.advance(TICK * 4)
  expect(w.reloads).toEqual([])
})

test('a file that is missing or not JSON (caught mid-write) changes nothing', { options: OPTIONS }, async ($, on) => {
  const w = world(on)
  await startSession($)
  await w.clock.advance(TICK * 2)

  w.write(SETTINGS, '{ "pluginConfigs": { "openskin@extras-claude-code": { "options": { "accent": "#bb')
  await w.clock.advance(TICK * 4)
  expect(w.reloads).toEqual([])
})

test('CLAUDE_CONFIG_DIR names where the settings file is', { options: OPTIONS }, async ($, on) => {
  const w = world(on, { HOME, CLAUDE_CONFIG_DIR: '/config' })
  w.write('/config/settings.json', settings({ ...THEME_DEFAULTS }))
  await startSession($)
  await w.clock.advance(TICK * 2)

  w.write('/config/settings.json', settings({ ...THEME_DEFAULTS, muted: '#737aa2' }))
  // One tick waits for Claude Code's own reload, the next asks for one.
  await w.clock.advance(TICK * 2 + 1)
  expect(w.reloads).toEqual(['reload-plugins'])
})
