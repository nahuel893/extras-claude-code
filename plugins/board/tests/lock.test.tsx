import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const USAGE = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

/** This session's board, under its project and its id. */
const BOARD = '/home/test/.cache/refined-claude-code/projects/-home-test-projects-app/session-1/board.md'

/** What /board's model writes in these tests: one item done, one new item before the old second. */
const REWRITE = '✓ Write the parser\n○ Pick the cache dir\n○ Add tests\n'

/** A promise the test settles by hand, to hold a model call or a file write mid-flight. */
const gate = () => {
  let open = () => {}
  const opened = new Promise<void>(resolve => {
    open = resolve
  })
  return { opened, open }
}

/**
 * Stands in for the engine beneath the mod: a file system that keeps what is written and can hold
 * a write, and a model that answers /board's rewrite only once the test opens its gate.
 */
const world = async ($: Engine, on: On) => {
  const clock = mock.clock(on, { now: 0 })
  const files: Record<string, string> = {}
  const model = gate()
  const prompts: string[] = []
  const toasts: string[] = []
  let writeGate: Promise<void> | undefined
  on('env.get', () => ({ value: '/home/test' }))
  on('session.cwd', () => ({ value: '/home/test/projects/app' }))
  on('session.id', () => ({ value: 'session-1' }))
  on('session.messages', () => ({ value: [{ role: 'user', text: 'Write the parser, then add tests.', toolUses: [] }] as never }))
  on('model.complete', async ($, e) => {
    prompts.push(e.prompt)
    await model.opened
    return { value: { isAnswered: true, text: REWRITE, usage: USAGE } as never }
  })
  on('fs.read', ($, e) => (e.path in files ? { value: files[e.path] as string } : { deny: `ENOENT: ${e.path}` }))
  on('fs.write', async ($, e) => {
    if (writeGate) await writeGate
    files[e.path] = e.text
    return { value: undefined }
  })
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('tool.register', ($, e) => ({ value: { tool: `mcp__board__${e.name}` } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/home/test/projects/app', surface: 'terminal', isInteractive: true })

  const call = (input: Record<string, unknown>) =>
    $.tool.call({ tool: 'mcp__board__board', ...input }).then(answer => answer.result as string)

  // The board as Claude knows it, built with the tool itself.
  await call({ action: 'add', text: 'Write the parser' })
  await call({ action: 'add', text: 'Add tests' })

  return {
    clock,
    files,
    prompts,
    toasts,
    call,
    /** Lets /board's model answer. */
    answer: model.open,
    /** Holds every file write until the returned function is called. */
    holdWrites: () => {
      const held = gate()
      writeGate = held.opened
      return () => {
        writeGate = undefined
        held.open()
      }
    },
    /** Starts /board and lets it run up to its model call. */
    board: async () => {
      await $.command.run({ command: 'board', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
      await clock.settle()
    },
  }
}

const REJECTED = 'The board was rewritten by /board. Current items:\n1. ✓ Write the parser\n2. ○ Pick the cache dir\n3. ○ Add tests\nCall again.'

test('a done that arrives mid-/board waits, then is rejected with the new list and writes nothing', async ($, on) => {
  const { clock, files, call, answer, board } = await world($, on)
  await board()

  const done = call({ action: 'done', item: 2 })
  await clock.advance(1_000)
  answer()
  await clock.advance(1_000)

  expect(await done).toBe(REJECTED)
  expect(files[BOARD]).toBe(REWRITE)
})

test('an add that arrives mid-/board waits, then applies to the new board and shows its numbers', async ($, on) => {
  const { clock, files, call, answer, board } = await world($, on)
  await board()

  const add = call({ action: 'add', text: 'Write the docs' })
  await clock.advance(1_000)
  answer()
  await clock.advance(1_000)

  expect(await add).toBe(
    'ok · added item 4 · 1 of 4 done\nThe board was rewritten by /board. Current items:\n1. ✓ Write the parser\n2. ○ Pick the cache dir\n3. ○ Add tests\n4. ○ Write the docs',
  )
  expect(files[BOARD]).toBe(`${REWRITE}○ Write the docs\n`)
})

test('a call still waiting when /board runs long writes nothing and asks to call again', async ($, on) => {
  const { clock, files, call, answer, board } = await world($, on)
  await board()

  const done = call({ action: 'done', item: 1 })
  await clock.advance(8_000)
  expect(await done).toBe('/board is rewriting the board, call again shortly.')
  expect(files[BOARD]).toBe('○ Write the parser\n○ Add tests\n')

  answer()
  await clock.settle()
  expect(files[BOARD]).toBe(REWRITE)
})

test('a done after a finished /board is rejected once with the new list, then applies', async ($, on) => {
  const { clock, files, call, answer, board } = await world($, on)
  await board()
  answer()
  await clock.settle()

  expect(await call({ action: 'done', item: 2 })).toBe(REJECTED)
  expect(await call({ action: 'done', item: 2 })).toBe('ok · 2 of 3 done')
  expect(files[BOARD]).toBe('✓ Write the parser\n✓ Pick the cache dir\n○ Add tests\n')
})

test('/board waits for a tool write in flight and reads the board it wrote', async ($, on) => {
  const { clock, files, prompts, call, answer, holdWrites, board } = await world($, on)
  const release = holdWrites()

  const add = call({ action: 'add', text: 'Write the docs' })
  await clock.settle()
  await board()
  expect(prompts).toEqual([])

  release()
  expect(await add).toBe('ok · added item 3 · 0 of 3 done')
  await clock.settle()
  expect(prompts[0]).toContain('○ Write the docs')

  answer()
  await clock.settle()
  expect(files[BOARD]).toBe(REWRITE)
})
