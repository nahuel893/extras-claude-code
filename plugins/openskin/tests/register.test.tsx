import { expect, test } from 'claude-code/testing'

const SURFACES = ['terminal', 'desktop'] as const

const DEFAULTS = {
  accent: '#f0a6ec',
  surface: '#24242c',
  toolBar: '#55555f',
  error: '#ff6b5b',
  muted: '#7f7f8a',
  command: 'bashBorder',
  background: '#1c1c22',
}

type Found = { props: Record<string, unknown>; text: string }
type Drawing = {
  find: (q: { type?: string; text?: string | RegExp }) => Promise<Found | undefined>
  findAll: (q: { type?: string; text?: string | RegExp }) => Promise<Found[]>
}

const message = (text: string, extra: { isSummary?: true } = {}) => ({
  plugin: 'openskin',
  component: 'AssistantMessage' as const,
  requestId: 'msg-1',
  props: { text, isFirstOfReply: true, ...extra },
})

const backgrounds = async (ui: Drawing) =>
  (await ui.findAll({ type: 'Box' })).map(box => box.props.backgroundColor).filter(Boolean)

/** The outer row, the left bar and the content box of a block, found by their shape. */
const block = async (ui: Drawing) => {
  const boxes = await ui.findAll({ type: 'Box' })

  return {
    row: boxes.find(box => box.props.flexDirection === 'row' && box.props.alignItems === 'stretch'),
    bar: boxes.find(box => box.props.width === 1 && typeof box.props.backgroundColor === 'string'),
    content: boxes.find(box => box.props.paddingX === 2 && typeof box.props.backgroundColor === 'string'),
  }
}

// --- Claude's replies -------------------------------------------------------

test('a shell block is drawn as a framed command between the prose, in a reply band with no bullet, on every surface', async $ => {
  const text = 'Run this:\n\n```bash\nsudo pacman -Sc\n```\n\nThen tell me.'

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...message(text), surface })

    const code = await ui.find({ type: 'Code' })
    expect(code?.text).toBe('sudo pacman -Sc')
    expect(code?.props.language).toBe('bash')

    const frames = await ui.findAll({ type: 'Box' })
    expect(frames.some(box => box.props.borderStyle === 'round' && box.props.borderColor === 'bashBorder')).toBe(true)
    expect((await ui.find({ type: 'Text', text: /command/ }))?.props.color).toBe('bashBorder')

    expect((await ui.find({ type: 'Markdown', text: /Run this:/ }))?.text).toBe('Run this:')
    expect((await ui.find({ type: 'Markdown', text: /Then tell me/ }))?.text).toBe('Then tell me.')

    // Each piece keeps one row clear above itself and none below, so two neighbours never double it.
    // The band's gutter and padding start its text at column 5, where a block's does.
    expect(frames[0]?.props).toMatchObject({ marginX: 2, paddingLeft: 3, paddingRight: 2, marginTop: 1 })
    expect(frames[0]?.props.marginBottom).toBeUndefined()
    expect(frames[0]?.props.marginY).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: '●' })).toBeUndefined()
    expect(await backgrounds(ui)).toEqual([DEFAULTS.background])
    await ui.unmount()
  }
})

test('every shell block of a reply gets its own frame, tilde fences and list indents included', async $ => {
  const text = [
    '1. First:',
    '   ```bash',
    '   ls -la',
    '   ```',
    '2. Second:',
    '~~~sh',
    'df -h /',
    '~~~',
  ].join('\n')

  const ui = await $.ui.mount({ ...message(text), surface: 'terminal' })
  const codes = await ui.findAll({ type: 'Code' })

  expect(codes.map(code => code.text)).toEqual(['ls -la', 'df -h /'])
  await ui.unmount()
})

test('a reply with no shell block is drawn as markdown, in a reply band with no bullet', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  for (const surface of SURFACES) {
    for (const text of ['No commands here.', '```ts\nconst x = 1\n```', '```bash\nnever closed']) {
      const ui = await $.ui.mount({ ...message(text), surface })

      expect((await ui.find({ type: 'Markdown' }))?.text).toBe(text)
      expect(await ui.find({ type: 'Text', text: 'engine' })).toBeUndefined()
      expect(await ui.find({ type: 'Code' })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: '●' })).toBeUndefined()
      expect((await ui.find({ type: 'Box' }))?.props).toMatchObject({ marginX: 2, paddingLeft: 3, paddingRight: 2, marginTop: 1 })
      expect(await backgrounds(ui)).toEqual([DEFAULTS.background])
      await ui.unmount()
    }
  }
})

test('a summary row keeps the engine drawing, without the bullet, so it lines up with the replies', async ($, on) => {
  const seen: Record<string, unknown>[] = []
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    seen.push({ ...e.props })

    return <Text>engine</Text>
  })

  const ui = await $.ui.mount({ ...message('```bash\nls\n```', { isSummary: true }), surface: 'terminal' })

  expect(await ui.find({ type: 'Text', text: 'engine' })).toBeDefined()
  expect(await ui.find({ type: 'Code' })).toBeUndefined()
  expect(seen.at(-1)).toMatchObject({ isFirstOfReply: false, isSummary: true })
  // The engine's own 2-column gutter plus 3 lines its text up with the replies at column 5.
  expect((await ui.find({ type: 'Box' }))?.props.paddingLeft).toBe(3)
  expect(await backgrounds(ui)).toEqual([])
  await ui.unmount()
})

test('an untagged fence that opens like a command is framed as one, highlighted as bash', async $ => {
  for (const command of ['! sudo pacman -S --needed keyd', '$ ls -la /home/user', 'sudo systemctl enable --now keyd']) {
    const ui = await $.ui.mount({ ...message(`Run this:\n\n\`\`\`\n${command}\n\`\`\`\n\nDone.`), surface: 'terminal' })
    const code = await ui.find({ type: 'Code' })

    expect(code?.text).toBe(command)
    expect(code?.props.language).toBe('bash')
    expect(await ui.find({ type: 'Text', text: /command/ })).toBeDefined()
    await ui.unmount()
  }
})

test('an untagged fence that does not open like a command stays in the prose', async $ => {
  const text = 'Output:\n\n```\ntotal 610492\ndrwx------ 1 nh nh 5572 oct 25 .\n```'
  const ui = await $.ui.mount({ ...message(text), surface: 'terminal' })

  expect(await ui.find({ type: 'Code' })).toBeUndefined()
  expect((await ui.find({ type: 'Markdown' }))?.text).toBe(text)
  await ui.unmount()
})

test('the system prompt asks Claude to tag every shell command fence, after the engine sections', async ($, on) => {
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'You are Claude Code.', scope: 'shared' as const }] }))

  const { sections } = await $.prompt.compose({
    model: 'claude-opus-5-5',
    promptModel: 'claude-opus-5-5',
    surfaces: ['terminal'],
    tools: [],
    outputStyle: null,
    traits: [],
  })

  expect(sections.map(section => section.id)).toEqual(['intro', 'openskin:shell-fences'])
  expect(sections.at(-1)).toMatchObject({ scope: 'session', text: expect.stringContaining('```bash') })
})

// --- Theme --------------------------------------------------------------------

test('the command frame color comes from the mod options', { options: { command: '#abcdef' } }, async $ => {
  const ui = await $.ui.mount({ ...message('```sh\nls\n```'), surface: 'terminal' })

  const frames = await ui.findAll({ type: 'Box' })
  expect(frames.some(box => box.props.borderColor === '#abcdef')).toBe(true)
  expect((await ui.find({ type: 'Text', text: /command/ }))?.props.color).toBe('#abcdef')
  await ui.unmount()
})

test(
  'block colors come from the mod options, trimmed, and a blank option falls back to its default',
  { options: { accent: '  #010203  ', surface: '   ' } },
  async $ => {
    const ui = await $.ui.mount({ ...prompt('hello'), surface: 'terminal' })
    const { bar, content } = await block(ui)

    expect(bar?.props.backgroundColor).toBe('#010203')
    expect(content?.props.backgroundColor).toBe(DEFAULTS.surface)
    await ui.unmount()
  },
)

// --- The person's prompts -----------------------------------------------------

function prompt(text: string, kind: 'composer' | 'bridge' | 'task-notification' | 'peer' = 'composer', isExpanded = false) {
  return {
    plugin: 'openskin',
    component: 'UserMessage' as const,
    requestId: 'user-1',
    props: { text, origin: { kind }, isExpanded },
  }
}

test("the person's prompt is a full-width block with an accent bar and a row of air around it, on every surface", async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  for (const surface of SURFACES) {
    for (const [kind, isExpanded] of [['composer', false], ['composer', true], ['bridge', false]] as const) {
      const ui = await $.ui.mount({ ...prompt('fix the build\nplease', kind, isExpanded), surface })
      const { row, bar, content } = await block(ui)

      expect(await ui.find({ type: 'Text', text: 'engine' })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: 'fix the build\nplease' })).toBeDefined()
      expect(row?.props).toMatchObject({ marginX: 2, marginTop: 1 })
      expect(bar?.props.backgroundColor).toBe(DEFAULTS.accent)
      expect(content?.props).toMatchObject({ backgroundColor: DEFAULTS.surface, paddingTop: 1, paddingBottom: 1 })
      await ui.unmount()
    }
  }
})

test('user rows that are not the person\'s own prompt keep the engine drawing', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  for (const surface of SURFACES) {
    for (const kind of ['task-notification', 'peer'] as const) {
      const ui = await $.ui.mount({ ...prompt('Task done', kind), surface })

      expect(await ui.find({ type: 'Text', text: 'engine' })).toBeDefined()
      expect(await backgrounds(ui)).toEqual([])
      await ui.unmount()
    }
  }
})

// --- Tool rows ----------------------------------------------------------------

const toolUse = {
  plugin: 'openskin',
  component: 'ToolUse' as const,
  requestId: 'tool-1',
  props: {
    tool_use_id: 'tool-1',
    tool: 'Bash',
    input: { command: 'ls' },
    isRunning: false,
    isErrored: false,
    isInterrupted: false,
    isExpanded: true,
  },
}

const toolResult = {
  plugin: 'openskin',
  component: 'ToolResult' as const,
  requestId: 'tool-1',
  props: { tool_use_id: 'tool-1', tool: 'Bash', output: { stdout: 'a\nb', stderr: '' }, isErrored: false, isExpanded: true },
}

const toolGroup = (isExpanded: boolean) => ({
  plugin: 'openskin',
  component: 'ToolGroup' as const,
  requestId: 'group-1',
  props: {
    calls: [{ tool: 'Read', input: { file_path: '/a' }, isRunning: false, isErrored: false, isInterrupted: false }],
    isActive: false,
    isExpanded,
  },
})

test('a tool call and its result read as one tool-barred block around the engine drawing, on every surface', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  for (const surface of SURFACES) {
    // The call opens a new block, a row clear above it; its result hangs right under it.
    const rows = [
      [toolUse, 1, { paddingTop: 1, paddingBottom: 0 }],
      [toolResult, 0, { paddingTop: 0, paddingBottom: 1 }],
    ] as const
    for (const [row, above, air] of rows) {
      const ui = await $.ui.mount({ ...row, surface })
      const { row: outer, bar, content } = await block(ui)

      expect(await ui.find({ type: 'Text', text: 'engine' })).toBeDefined()
      expect(outer?.props.marginTop).toBe(above)
      expect(bar?.props.backgroundColor).toBe(DEFAULTS.toolBar)
      expect(content?.props).toMatchObject({ backgroundColor: DEFAULTS.surface, ...air })
      await ui.unmount()
    }
  }
})

test('a folded tool group is one tool block; an unfolded one leaves its calls to their own blocks', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  for (const surface of SURFACES) {
    const folded = await $.ui.mount({ ...toolGroup(false), surface })
    const { bar, content } = await block(folded)

    expect(await folded.find({ type: 'Text', text: 'engine' })).toBeDefined()
    expect(bar?.props.backgroundColor).toBe(DEFAULTS.toolBar)
    expect(content?.props).toMatchObject({ paddingTop: 1, paddingBottom: 1 })
    await folded.unmount()

    const unfolded = await $.ui.mount({ ...toolGroup(true), surface })

    expect(await unfolded.find({ type: 'Text', text: 'engine' })).toBeDefined()
    expect(await backgrounds(unfolded)).toEqual([])
    await unfolded.unmount()
  }
})

// --- Error rows ---------------------------------------------------------------

const commandOutput = (isErrored: boolean) => ({
  plugin: 'openskin',
  component: 'CommandOutput' as const,
  requestId: 'cmd-1',
  props: { command: 'deploy', args: '', text: 'Error: deploy failed', isErrored },
})

test("a slash command's error line is an error-barred block with muted text; other output keeps the engine drawing", async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  for (const surface of SURFACES) {
    const errored = await $.ui.mount({ ...commandOutput(true), surface })
    const { bar, content } = await block(errored)

    expect(await errored.find({ type: 'Text', text: 'engine' })).toBeUndefined()
    expect((await errored.find({ type: 'Text', text: 'Error: deploy failed' }))?.props.color).toBe(DEFAULTS.muted)
    expect(bar?.props.backgroundColor).toBe(DEFAULTS.error)
    expect(content?.props).toMatchObject({ backgroundColor: DEFAULTS.surface, paddingTop: 1, paddingBottom: 1 })
    await errored.unmount()

    const plain = await $.ui.mount({ ...commandOutput(false), surface })

    expect(await plain.find({ type: 'Text', text: 'engine' })).toBeDefined()
    expect(await backgrounds(plain)).toEqual([])
    await plain.unmount()
  }
})

// --- Turn footer --------------------------------------------------------------

const turnDuration = (durationMs: number, extra: Record<string, unknown> = {}) => ({
  plugin: 'openskin',
  component: 'TurnDuration' as const,
  requestId: 'turn-1',
  props: { word: 'Baked', durationMs, isExpanded: true, ...extra },
})

test('the turn footer reads "▣ Claude · <model> · <duration>", indented like the replies', async ($, on) => {
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  const ui = await $.ui.mount({ ...turnDuration(6700), surface: 'terminal' })

  expect(await ui.find({ type: 'Text', text: 'engine' })).toBeUndefined()
  expect((await ui.find({ type: 'Box' }))?.props).toMatchObject({ paddingLeft: 5, marginTop: 1 })
  expect((await ui.find({ type: 'Text', text: /^▣$/ }))?.props.color).toBe(DEFAULTS.accent)
  expect((await ui.find({ type: 'Text', text: /^Claude$/ }))?.props.bold).toBe(true)
  const details = await ui.find({ type: 'Text', text: /^ · / })
  expect(details?.text).toBe(' · Opus 5.5 · 6.7s')
  expect(details?.props.color).toBe(DEFAULTS.muted)
  expect((await ui.find({ type: 'Text', text: /^▣ / }))?.text).toBe('▣ Claude · Opus 5.5 · 6.7s')
  await ui.unmount()
})

test('the footer names models and durations readably', async ($, on) => {
  let model = ''
  on('session.model', () => ({ value: model }))

  const cases: [string, number, string][] = [
    ['claude-opus-5-5', 72_000, ' · Opus 5.5 · 1m 12s'],
    ['claude-sonnet-4-5-20250929', 45_000, ' · Sonnet 4.5 · 45s'],
    ['claude-3-5-haiku-20241022', 9_960, ' · Haiku 3.5 · 10s'],
    ['claude-opus-4-6[1m]', 59_600, ' · Opus 4.6 · 1m 0s'],
    ['us.anthropic.claude-opus-5-5-v1:0', 3_725_000, ' · Opus 5.5 · 1h 2m'],
    ['opus', 0, ' · Opus · 0.0s'],
    ['gpt-4o', 1_234, ' · gpt-4o · 1.2s'],
  ]

  for (const [id, durationMs, expected] of cases) {
    model = id
    const ui = await $.ui.mount({ ...turnDuration(durationMs), surface: 'terminal' })

    expect((await ui.find({ type: 'Text', text: /^ · / }))?.text).toBe(expected)
    await ui.unmount()
  }
})

test('the footer leaves the model out when it cannot be read', async ($, on) => {
  on('session.model', () => {
    throw new Error('no model here')
  })

  const ui = await $.ui.mount({ ...turnDuration(6700), surface: 'terminal' })

  expect((await ui.find({ type: 'Text', text: /^ · / }))?.text).toBe(' · 6.7s')
  await ui.unmount()
})

test('while the turn line waits on background agents it keeps the engine drawing', async ($, on) => {
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  const waitingFor = { agents: [{ id: 'a1', agentType: 'general-purpose' }], workflows: 0 }
  const ui = await $.ui.mount({ ...turnDuration(6700, { waitingFor }), surface: 'terminal' })

  expect(await ui.find({ type: 'Text', text: 'engine' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '▣' })).toBeUndefined()
  await ui.unmount()
})
