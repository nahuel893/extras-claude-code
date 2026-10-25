import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

/** This session's board, under its project and its id. */
const BOARD = '/home/test/.cache/refined-claude-code/projects/-home-test-projects-app/session-1/board.md'

const TOOL = 'mcp__board__board'

/**
 * Stands in for the engine beneath the mod: the session's home, directory and id, a file system
 * that keeps what is written, and the tool list. Each tool call returns the text the model reads.
 */
const world = async ($: Engine, on: On, files: Record<string, string> = {}) => {
  const registered: { name: string; description: string; inputSchema?: Record<string, unknown> }[] = []
  const writes: { path: string; text: string }[] = []
  on('env.get', () => ({ value: '/home/test' }))
  on('session.cwd', () => ({ value: '/home/test/projects/app' }))
  on('session.id', () => ({ value: 'session-1' }))
  on('fs.read', ($, e) => (e.path in files ? { value: files[e.path] as string } : { deny: `ENOENT: ${e.path}` }))
  on('fs.write', ($, e) => {
    writes.push({ path: e.path, text: e.text })
    files[e.path] = e.text
    return { value: undefined }
  })
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('tool.register', ($, e) => {
    registered.push(e)
    return { value: { tool: `mcp__board__${e.name}` } }
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/home/test/projects/app', surface: 'terminal', isInteractive: true })

  return {
    files,
    writes,
    registered,
    /** Calls the board tool as the model would, and answers what the model reads. */
    call: async (input: Record<string, unknown>) => {
      const answer = await $.tool.call({ tool: TOOL, ...input })
      if (answer.deny !== undefined) throw new Error(`denied: ${answer.deny}`)
      return answer.result
    },
  }
}

test('the board tool is registered at session start with a short description and an action schema', async ($, on) => {
  const { registered } = await world($, on)

  expect(registered.map(tool => tool.name)).toEqual(['board'])
  expect(registered[0]?.description).toContain('multi-step')
  expect(registered[0]?.inputSchema).toEqual(expect.objectContaining({ required: ['action'] }))
})

test('add appends a pending item to an empty board and returns its number', async ($, on) => {
  const { files, call } = await world($, on)

  expect(await call({ action: 'add', text: 'Write the parser' })).toBe('ok · added item 1 · 0 of 1 done')
  expect(files[BOARD]).toBe('○ Write the parser\n')
})

test('add keeps the existing lines and their order', async ($, on) => {
  const { files, call } = await world($, on, { [BOARD]: '✓ Wrote the parser\n◇ Pick the cache dir\n' })

  expect(await call({ action: 'add', text: '  Add\ntests  ' })).toBe('ok · added item 3 · 1 of 3 done')
  expect(files[BOARD]).toBe('✓ Wrote the parser\n◇ Pick the cache dir\n○ Add tests\n')
})

test('done and wait change the mark of item n', async ($, on) => {
  const { files, call } = await world($, on, { [BOARD]: '○ Write the parser\n○ Add tests\n○ Pick the cache dir\n' })

  expect(await call({ action: 'done', item: 1 })).toBe('ok · 1 of 3 done')
  expect(await call({ action: 'wait', item: 3 })).toBe('ok · 1 of 3 done')
  expect(files[BOARD]).toBe('✓ Write the parser\n○ Add tests\n◇ Pick the cache dir\n')
})

test('a bad number, empty text or unknown action replies with a short message and writes nothing', async ($, on) => {
  const { writes, call } = await world($, on, { [BOARD]: '○ Write the parser\n' })

  expect(await call({ action: 'done', item: 2 })).toBe('No item 2: the board has 1 item.')
  expect(await call({ action: 'wait', item: 0 })).toBe('No item 0: the board has 1 item.')
  expect(await call({ action: 'done' })).toBe('Give the item number to mark.')
  expect(await call({ action: 'add', text: '   ' })).toBe("Give the item's text to add.")
  expect(await call({ action: 'drop', item: 1 })).toBe('Unknown action drop: use add, done or wait.')
  expect(writes).toEqual([])
})
