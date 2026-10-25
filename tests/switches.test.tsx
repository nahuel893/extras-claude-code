import type { On } from 'claude-code'
import { expect, test, type Engine } from 'claude-code/testing'

const SURFACES = ['terminal', 'desktop'] as const

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

const REPLY = 'Run this:\n\n```bash\nsudo pacman -Sc\n```\n\nThen tell me.'

/** Stands for the engine: draws each row as `engine` plus its text, and keeps the props it was handed. */
const engine = (on: On) => {
  const seen: Record<string, unknown>[] = []
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    const props = e.props as Record<string, unknown>
    seen.push({ ...props })

    return <Text>{`engine:${typeof props.text === 'string' ? props.text : ''}`}</Text>
  })
  return seen
}

const compose = async ($: Engine) =>
  (
    await $.prompt.compose({
      model: 'claude-opus-5-5',
      promptModel: 'claude-opus-5-5',
      surfaces: ['terminal'],
      tools: [],
      outputStyle: null,
      traits: [],
    })
  ).sections.map(section => section.id)

// --- opencodeStyle off ------------------------------------------------------------

const rows = [
  {
    component: 'UserMessage' as const,
    props: { text: 'fix the build', origin: { kind: 'composer' }, isExpanded: false },
  },
  {
    component: 'ToolUse' as const,
    props: {
      tool_use_id: 'tool-1',
      tool: 'Bash',
      input: { command: 'ls' },
      isRunning: false,
      isErrored: false,
      isInterrupted: false,
      isExpanded: true,
    },
  },
  {
    component: 'ToolResult' as const,
    props: { tool_use_id: 'tool-1', tool: 'Bash', output: { stdout: 'a', stderr: '' }, isErrored: false, isExpanded: true },
  },
  {
    component: 'ToolGroup' as const,
    props: {
      calls: [{ tool: 'Read', input: { file_path: '/a' }, isRunning: false, isErrored: false, isInterrupted: false }],
      isActive: false,
      isExpanded: false,
    },
  },
  {
    component: 'CommandOutput' as const,
    props: { command: 'deploy', args: '', text: 'Error: deploy failed', isErrored: true },
  },
  {
    component: 'TurnDuration' as const,
    props: { word: 'Baked', durationMs: 6700, isExpanded: true },
  },
]

/** Mounts one of `rows`; its props are a union the kit's per-component typing can't narrow. */
const mountRow = ($: Engine, row: (typeof rows)[number], surface: (typeof SURFACES)[number]) =>
  $.ui.mount({ plugin: 'openskin', requestId: 'row-1', ...row, surface } as Parameters<Engine['ui']['mount']>[0])

test('with opencodeStyle off, prompts, tool rows, errors and the turn line keep the engine drawing', { options: { opencodeStyle: false } }, async ($, on) => {
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  engine(on)

  for (const surface of SURFACES) {
    for (const row of rows) {
      const ui = await mountRow($, row, surface)

      expect(await ui.find({ type: 'Text', text: /^engine:/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '▣' })).toBeUndefined()
      expect(await backgrounds(ui)).toEqual([])
      await ui.unmount()
    }
  }
})

test('with opencodeStyle off, a reply with no shell command keeps the engine drawing as it came', { options: { opencodeStyle: false } }, async ($, on) => {
  const seen = engine(on)

  for (const surface of SURFACES) {
    for (const text of ['No commands here.', '```ts\nconst x = 1\n```']) {
      const ui = await $.ui.mount({ ...message(text), surface })

      expect((await ui.find({ type: 'Text', text: /^engine:/ }))?.text).toBe(`engine:${text}`)
      expect(seen.at(-1)).toMatchObject({ text, isFirstOfReply: true })
      expect(await ui.find({ type: 'Code' })).toBeUndefined()
      expect(await ui.find({ type: 'Markdown' })).toBeUndefined()
      await ui.unmount()
    }
  }
})

test(
  'with opencodeStyle off, the engine draws the prose of a reply and only its shell commands are framed, lined up with its text',
  { options: { opencodeStyle: false } },
  async ($, on) => {
    const seen = engine(on)

    for (const surface of SURFACES) {
      seen.length = 0
      const ui = await $.ui.mount({ ...message(REPLY), surface })

      // Each prose piece goes through the engine; only the first keeps the reply's bullet.
      const prose = await ui.findAll({ type: 'Text', text: /^engine:/ })
      expect(prose.map(text => text.text)).toEqual(['engine:Run this:', 'engine:Then tell me.'])
      expect(seen.map(props => [props.text, props.isFirstOfReply])).toEqual([
        ['Run this:', true],
        ['Then tell me.', false],
      ])

      const code = await ui.find({ type: 'Code' })
      expect(code?.text).toBe('sudo pacman -Sc')
      expect(code?.props.language).toBe('bash')
      expect(await ui.find({ type: 'Markdown' })).toBeUndefined()

      const boxes = await ui.findAll({ type: 'Box' })
      expect(boxes.some(box => box.props.borderStyle === 'round' && box.props.borderColor === 'bashBorder')).toBe(true)
      // The frame sits behind the engine's 2-column bullet gutter, where its text starts.
      expect(boxes.some(box => box.props.paddingLeft === 2)).toBe(true)
      expect(boxes.some(box => box.props.paddingLeft === 5)).toBe(false)
      expect(await backgrounds(ui)).toEqual([])
      await ui.unmount()
    }
  },
)

test('with opencodeStyle off, a summary row keeps the engine drawing untouched', { options: { opencodeStyle: false } }, async ($, on) => {
  const seen = engine(on)
  const ui = await $.ui.mount({ ...message('```bash\nls\n```', { isSummary: true }), surface: 'terminal' })

  expect(await ui.find({ type: 'Text', text: /^engine:/ })).toBeDefined()
  expect(await ui.find({ type: 'Code' })).toBeUndefined()
  expect(seen.at(-1)).toMatchObject({ isFirstOfReply: true, isSummary: true })
  expect(await ui.find({ type: 'Box' })).toBeUndefined()
  await ui.unmount()
})

test('with opencodeStyle off, the system prompt still asks for tagged shell fences', { options: { opencodeStyle: false } }, async ($, on) => {
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'You are Claude Code.', scope: 'shared' as const }] }))

  expect(await compose($)).toEqual(['intro', 'openskin:shell-fences'])
})

// --- commandFrames off ------------------------------------------------------------

test('with commandFrames off, a reply is one markdown piece, its shell blocks unframed, in the OpenCode look', { options: { commandFrames: false } }, async ($, on) => {
  engine(on)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...message(REPLY), surface })

    expect((await ui.findAll({ type: 'Markdown' })).map(markdown => markdown.text)).toEqual([REPLY])
    expect(await ui.find({ type: 'Code' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /command/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^engine:/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('with commandFrames off, the system prompt gets no fence rule', { options: { commandFrames: false } }, async ($, on) => {
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'You are Claude Code.', scope: 'shared' as const }] }))

  expect(await compose($)).toEqual(['intro'])
})

test('with commandFrames off, the prompt still gets its OpenCode block', { options: { commandFrames: false } }, async ($, on) => {
  engine(on)
  const ui = await mountRow($, rows[0]!, 'terminal')

  expect(await ui.find({ type: 'Text', text: /^engine:/ })).toBeUndefined()
  expect(await backgrounds(ui)).toContain('#f0a6ec')
  await ui.unmount()
})

// --- both off ---------------------------------------------------------------------

test('with both switches off, the transcript and the system prompt are the engine\'s own', { options: { opencodeStyle: false, commandFrames: false } }, async ($, on) => {
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'You are Claude Code.', scope: 'shared' as const }] }))
  const seen = engine(on)

  expect(await compose($)).toEqual(['intro'])

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...message(REPLY), surface })

    expect((await ui.find({ type: 'Text', text: /^engine:/ }))?.text).toBe(`engine:${REPLY}`)
    expect(seen.at(-1)).toMatchObject({ text: REPLY, isFirstOfReply: true })
    expect(await ui.find({ type: 'Code' })).toBeUndefined()
    expect(await ui.find({ type: 'Box' })).toBeUndefined()
    await ui.unmount()
  }
})
