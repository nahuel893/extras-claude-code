import type { EngineInterface, PluginOptions } from 'claude-code'

/**
 * Keeps an open session in step with openskin's options as `settings.json` holds them.
 *
 * Claude Code reloads the mod by itself when its options change in that file, but only while it
 * still watches the file: a session started before `settings.json` was replaced (say, by a symlink
 * into a dotfiles repository) keeps the settings it read at the start. Such a session draws stale
 * colors and, worse, writes its stale copy back whole on the next settings change it makes, `/skin`
 * included, undoing what was edited outside it.
 *
 * So a timer reads the file whenever its mtime changes and compares openskin's options there, and
 * Claude Code's `theme`, with what the session holds. A difference that outlasts one tick (time for
 * Claude Code's own reload) runs `/reload-plugins`, which re-reads the settings without writing
 * anything. Each difference is reloaded once per session, so one another settings layer keeps in
 * place (project settings, managed settings) never loops.
 */
const SETTINGS = 'settings.json'
export const FOLLOW_MS = 1500
/** The store key of this session's last reloaded difference, by session id. */
const RELOADED = 'follow.'
/** How long a reloaded difference stays in the store once its session is gone. */
const KEEP_MS = 7 * 24 * 60 * 60 * 1000
/** The pause before a reload is asked, out of the hook that found the difference. */
const RELOAD_DELAY_MS = 1

type Settings = Record<string, unknown>

/** A difference between the file and the session, named by the values the file holds. */
export type Drift = { signature: string }

const isRecord = (value: unknown): value is Settings => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * openskin's options in the settings file: under its installed id (`openskin@<marketplace>`), or
 * `openskin` / `openskin@inline` when loaded from a folder. `undefined` when there are none.
 */
export const ownOptions = (settings: unknown): Settings | undefined => {
  if (!isRecord(settings) || !isRecord(settings.pluginConfigs)) return undefined
  const configs = settings.pluginConfigs
  const ids = Object.keys(configs).filter(id => id === 'openskin' || id.startsWith('openskin@'))
  // An installed id first: that is the one Claude Code reads for an installed plugin.
  const id = ids.find(id => id.startsWith('openskin@') && id !== 'openskin@inline') ?? ids[0]
  const entry = id === undefined ? undefined : configs[id]
  return isRecord(entry) && isRecord(entry.options) ? entry.options : undefined
}

/** The options the file sets to something other than what the session was registered with. */
export const driftedKeys = (file: Settings, registered: PluginOptions): string[] =>
  Object.keys(file).filter(key => JSON.stringify(file[key]) !== JSON.stringify(registered[key]))

/** Where Claude Code keeps the person's settings: `$CLAUDE_CONFIG_DIR`, else `~/.claude`. */
export async function settingsPath($: EngineInterface): Promise<string | undefined> {
  const dir = await $.env.get('CLAUDE_CONFIG_DIR')
  if (dir) return `${dir.replace(/\/+$/, '')}/${SETTINGS}`
  const home = await $.env.get('HOME')
  return home ? `${home}/.claude/${SETTINGS}` : undefined
}

/**
 * Reads the settings file and compares openskin's options and the theme there with the session's:
 * `null` when they agree or the file cannot be read or parsed (a write caught halfway).
 */
export async function readDrift($: EngineInterface, path: string, registered: PluginOptions): Promise<Drift | null> {
  let settings: unknown
  try {
    settings = JSON.parse(await $.fs.read(path))
  } catch {
    return null
  }
  if (!isRecord(settings)) return null

  const options = ownOptions(settings) ?? {}
  const drifted = driftedKeys(options, registered).length > 0

  const theme = typeof settings.theme === 'string' ? settings.theme : undefined
  let themeDrifted = false
  if (theme !== undefined) {
    const row = (await $.config.list().catch(() => [])).find(row => row.key === 'theme')
    themeDrifted = row !== undefined && row.value !== theme
  }

  if (!drifted && !themeDrifted) return null
  return { signature: JSON.stringify({ options, theme }) }
}

/**
 * Runs `/reload-plugins` for a difference unless this session already did for the same one.
 * The mark is stored first, as the reload starts this module over. True when a reload was asked.
 */
export async function reloadOnce($: EngineInterface, drift: Drift): Promise<boolean> {
  const id = await $.session.id().catch(() => 'unknown')
  const key = `${RELOADED}${id}`
  const mark = await $.store.get(key)
  if (isRecord(mark) && mark.signature === drift.signature) return false

  const now = await $.clock.now()
  await $.store.set(key, { signature: drift.signature, at: now })
  // Marks of sessions long gone are dropped while at it.
  for (const other of await $.store.keys()) {
    if (other === key || !other.startsWith(RELOADED)) continue
    const old = await $.store.get(other)
    if (!isRecord(old) || typeof old.at !== 'number' || now - old.at > KEEP_MS) await $.store.delete(other)
  }

  // Run from a timer of its own: a command cannot run another from inside its hook. The reload
  // waits for the session to be idle and starts this module over, so nothing awaits it.
  $.clock.after(RELOAD_DELAY_MS, () => void $.command.run({ command: 'reload-plugins' }).catch(() => undefined))
  return true
}

/**
 * Starts the timer that follows the settings file. `isPaused` holds it while openskin itself
 * changes settings (`/skin`), whose writes reload the mod anyway.
 */
export async function startFollowing($: EngineInterface, registered: PluginOptions, isPaused: () => boolean) {
  const path = await settingsPath($)
  if (!path) return

  let seenMtime = -1
  // A difference seen at the last tick, waiting one tick for Claude Code's own reload.
  let pending = ''
  let isBusy = false

  const follow = async () => {
    if (isBusy || isPaused()) return
    isBusy = true
    try {
      const { mtimeMs } = await $.fs.stat(path)
      if (mtimeMs === seenMtime && !pending) return
      seenMtime = mtimeMs

      const drift = await readDrift($, path, registered)
      if (drift === null) {
        pending = ''
        return
      }
      if (pending !== drift.signature) {
        pending = drift.signature
        return
      }
      pending = ''
      await reloadOnce($, drift)
    } catch {
      // No settings file, or it could not be read: the next tick tries again.
    } finally {
      isBusy = false
    }
  }

  $.clock.every(FOLLOW_MS, () => void follow())
}
