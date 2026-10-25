import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { inputDir, parseNumstat, parseStatus, shortHome } from '../hooks/project'
import { THEME_DEFAULTS } from '../hooks/theme'

const HOME = '/home/test'
const PANE = {
  plugin: 'openskin',
  component: 'Pane',
  requestId: 'openskin-status',
  surface: 'terminal',
  props: { title: 'Status', isFocused: false, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

const STATUS_DIRTY =
  '# branch.oid 0123456789abcdef\n# branch.head feat/cards\n' +
  '1 .M N... 100644 100644 100644 aaaa bbbb hooks/statusline.tsx\n' +
  '2 R. N... 100644 100644 100644 aaaa bbbb R100 hooks/new.tsx\thooks/old.tsx\n' +
  '? notes.txt\n'
const NUMSTAT_DIRTY = '12\t4\thooks/statusline.tsx\n3\t0\thooks/new.tsx\n-\t-\tlogo.png\n'
const STATUS_CLEAN = '# branch.oid 0123456789abcdef\n# branch.head main\n'

type Git = { status: string; numstat: string; exitCode?: number }

/**
 * Everything beneath the mod: the clock, the session's home and id, a status line input naming
 * the project, a status line script that prints `[Opus 5.5] | v2.1`, and a git whose answers a
 * test sets (every git run is kept, so a test can count them).
 */
function world(on: On, git: Git = { status: STATUS_DIRTY, numstat: NUMSTAT_DIRTY }) {
  const clock = mock.clock(on, { now: 0 })
  const state = { git, input: { text: '{"workspace":{"current_dir":"/home/test/projects/app"}}', mtimeMs: 1 } }
  const gitRuns: string[][] = []
  on('env.get', () => ({ value: HOME }))
  on('session.id', () => ({ value: 'session-1' }))
  on('fs.stat', ($, e) =>
    e.path.endsWith('/sessions/session-1.json') ? { value: { mtimeMs: state.input.mtimeMs } as never } : { deny: 'ENOENT' },
  )
  on('fs.read', ($, e) => (e.path.endsWith('/sessions/session-1.json') ? { value: state.input.text } : { deny: 'ENOENT' }))
  on('process.run', ($, e) => {
    const argv = [...e.argv]
    if (argv[0] !== 'git') return { value: { exitCode: 0, stdout: '[Opus 5.5] | v2.1\n', stderr: '' } as never }
    gitRuns.push(argv)
    const { status, numstat, exitCode = 0 } = state.git
    const stdout = argv.includes('status') ? status : numstat
    return { value: { exitCode, stdout: exitCode === 0 ? stdout : '', stderr: '' } as never }
  })
  on('command.register', () => ({ value: { command: 'panel' } }))
  on('store.get', () => ({ value: undefined }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] } }))

  return { clock, state, gitRuns }
}

/** Starts the session and lets the first, unawaited runs (script, git) settle on the next tick. */
const startSession = async ($: Engine, clock: { advance: (ms: number) => Promise<void> }) => {
  await $.session.start({ cwd: '/home/test/projects/app', surface: 'terminal', isInteractive: true })
  await clock.advance(1500)
}

/** Every Text of the panel, outer rows and inner spans alike. */
const texts = async ($: Engine) => {
  const ui = await $.ui.mount(PANE)
  const all = (await ui.findAll({ type: 'Text' })).map(text => text.text)
  await ui.unmount()
  return all
}

type Found = { type: string; props: Record<string, unknown>; text: string; children: unknown[] }
const isElement = (child: unknown): child is Found => typeof child === 'object' && child !== null && 'props' in child

/**
 * A card as drawn: a Box holding the round-bordered Box and, after it (so painted over its top
 * edge), an absolute Box at the top, its accent Text the title. The overlay sits beside the border
 * rather than inside it, since a Box clips what it holds to the inside of its border.
 */
const cardParts = (box: Found) => {
  const children = box.children.filter(isElement)
  const border = children.find(child => child.props.borderStyle === 'round')
  const overlay = children.find(child => child.props.position === 'absolute')
  if (!border || !overlay || children.indexOf(overlay) < children.indexOf(border)) return null
  const title = overlay.children
    .filter(isElement)
    .flatMap(text => text.children)
    .filter(isElement)
    .find(text => text.props.color === THEME_DEFAULTS.accent)
  return { border, overlay, title: title?.children.filter(child => typeof child === 'string').join('') }
}

/** The innermost Text that shows exactly `text` (an outer row shows its spans together). */
const exact = async (ui: { findAll: (query: { type: string; text: RegExp }) => Promise<Found[]> }, text: string) =>
  (await ui.findAll({ type: 'Text', text: new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) })).at(-1)

test('porcelain v2 status gives the branch and counts changed and untracked files', async () => {
  expect(parseStatus(STATUS_DIRTY)).toEqual({ branch: 'feat/cards', files: 3 })
  expect(parseStatus(STATUS_CLEAN)).toEqual({ branch: 'main', files: 0 })
  expect(parseStatus('')).toEqual({ branch: null, files: 0 })
})

test('numstat adds up the lines, a binary file counting none', async () => {
  expect(parseNumstat(NUMSTAT_DIRTY)).toEqual({ added: 15, deleted: 4 })
  expect(parseNumstat('')).toEqual({ added: 0, deleted: 0 })
})

test('the home directory reads as ~', async () => {
  expect(shortHome('/home/test/projects/app', HOME)).toBe('~/projects/app')
  expect(shortHome('/home/test', HOME)).toBe('~')
  expect(shortHome('/home/tester/app', HOME)).toBe('/home/tester/app')
})

test("the status line input names the project's directory, the session's otherwise", async () => {
  expect(inputDir('{"workspace":{"current_dir":"/a"},"cwd":"/b"}', '/c')).toBe('/a')
  expect(inputDir('{"cwd":"/b"}', '/c')).toBe('/b')
  expect(inputDir('not json', '/c')).toBe('/c')
})

test('every section is a round card whose title sits on its top border', async ($, on) => {
  const { clock } = world(on)
  await startSession($, clock)

  const ui = await $.ui.mount(PANE)
  const cards = (await ui.findAll({ type: 'Box' })).map(cardParts).filter(parts => parts !== null)
  expect(cards.length).toBeGreaterThan(0)
  expect(cards.length).toBe((await ui.findAll({ type: 'Box' })).filter(box => box.props.borderStyle === 'round').length)
  expect(cards[0]?.title).toBe('✿ Status')
  for (const { border, overlay } of cards) {
    expect(border.props.borderColor).toBe(THEME_DEFAULTS.toolBar)
    // Row 0 of the card is its top border; two columns in leaves `╭─` before the title.
    expect(overlay.props).toMatchObject({ position: 'absolute', top: 0, left: 2 })
  }
  await ui.unmount()
})

test('panelBackground paints the whole panel body, at least as tall as the pane', { options: { panelBackground: '#000000' } }, async ($, on) => {
  const { clock } = world(on)
  await startSession($, clock)

  const ui = await $.ui.mount(PANE)
  expect((await ui.drawn()).props).toMatchObject({ backgroundColor: '#000000', minHeight: 30 })
  await ui.unmount()
})

test('with panelBackground none, the default, the panel paints no background', async ($, on) => {
  const { clock } = world(on)
  await startSession($, clock)

  const ui = await $.ui.mount(PANE)
  const root = await ui.drawn()
  expect(root.props).not.toHaveProperty('backgroundColor')
  expect(root.props).not.toHaveProperty('minHeight')
  await ui.unmount()
})

test('the Status card: project, branch and changes from git, then the status line rows', async ($, on) => {
  const { clock } = world(on)
  await startSession($, clock)

  const ui = await $.ui.mount(PANE)
  const all = (await ui.findAll({ type: 'Text' })).map(text => text.text)
  const order = ['Project', '~/projects/app', 'Branch', 'feat/cards', 'Changes', '[Opus 5.5]', 'v2.1']
  expect(order.map(text => all.indexOf(text)).every((at, i, list) => at >= 0 && (i === 0 || at > list[i - 1]!))).toBe(true)
  expect((await exact(ui, 'Project'))?.props.color).toBe(THEME_DEFAULTS.muted)
  expect((await exact(ui, 'Branch'))?.props.color).toBe(THEME_DEFAULTS.muted)
  expect((await exact(ui, '~/projects/app'))?.props.bold).toBe(true)
  expect((await exact(ui, 'feat/cards'))?.props.bold).toBe(true)
  expect(await exact(ui, '3 files · ')).toBeDefined()
  expect((await exact(ui, '+15'))?.props.color).toBe('green')
  expect((await exact(ui, '-4'))?.props.color).toBe(THEME_DEFAULTS.error)
  await ui.unmount()
})

test('a clean tree has no Changes, and a directory outside git no Branch either', async ($, on) => {
  const { clock, state } = world(on, { status: STATUS_CLEAN, numstat: '' })
  await startSession($, clock)
  const clean = await texts($)
  expect(clean).toContain('Branch')
  expect(clean).not.toContain('Changes')

  state.git = { status: '', numstat: '', exitCode: 128 }
  await clock.advance(1500 * 10)
  const outside = await texts($)
  expect(outside).toContain('~/projects/app')
  expect(outside).not.toContain('Branch')
  expect(outside).not.toContain('Changes')
})

test('git runs again when the status line input changes, and otherwise every tenth tick', async ($, on) => {
  const { clock, state, gitRuns } = world(on)
  await startSession($, clock)
  const runs = () => gitRuns.filter(argv => argv.includes('status')).length
  const first = runs()
  expect(first).toBeGreaterThan(0)

  // Unchanged input: nothing until the tenth tick.
  await clock.advance(1500 * 8)
  expect(runs()).toBe(first)
  await clock.advance(1500 * 2)
  expect(runs()).toBe(first + 1)

  // New input in another directory: git runs there on the next tick.
  state.input = { text: '{"workspace":{"current_dir":"/home/test/other"}}', mtimeMs: 2 }
  await clock.advance(1500)
  expect(runs()).toBe(first + 2)
  expect(gitRuns.at(-1)).toContain('/home/test/other')
  expect(await texts($)).toContain('~/other')
})
