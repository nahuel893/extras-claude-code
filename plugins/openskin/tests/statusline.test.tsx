import { expect, mock, test } from 'claude-code/testing'
import { outputLines, parseAnsi } from '../hooks/statusline'

/** What `~/.claude/statusline.sh` printed for a real session, escape codes and all. */
const SCRIPT_OUTPUT =
  '\u001b[36m[Opus 5.5]\u001b[0m 📁 openskin-claude-code | 🌿 main \u001b[32m+15\u001b[0m\n' +
  '\u001b[32m██░░░░░░░░\u001b[0m 23% (233811/1000000) | \u001b[33m$32.15\u001b[0m | ⏱ 213m38s (api 77m12s) | \u001b[32m+1999\u001b[0m/\u001b[31m-401\u001b[0m\n'

const BAND = {
  plugin: 'openskin',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 12,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 11 },
    view: {},
  },
} as const

test("the status line script's output becomes styled spans, escape codes gone", async () => {
  const [first, second] = outputLines(SCRIPT_OUTPUT).map(parseAnsi)

  expect(first).toEqual([
    { text: '[Opus 5.5]', color: 'cyan' },
    { text: ' 📁 openskin-claude-code | 🌿 main ' },
    { text: '+15', color: 'green' },
  ])
  expect(second?.map(span => span.color)).toEqual(['green', undefined, 'yellow', undefined, 'green', undefined, 'red'])
  expect(second?.map(span => span.text).join('')).toBe(
    '██░░░░░░░░ 23% (233811/1000000) | $32.15 | ⏱ 213m38s (api 77m12s) | +1999/-401',
  )
})

test('256-color, truecolor, bold, dim and other escapes', async () => {
  expect(parseAnsi('\x1b[1;38;5;196mA\x1b[2;38;2;1;2;3mB\x1b[39;22mC\x1b]0;title\x07\x1b[KD\x1b[48;5;244mE')).toEqual([
    { text: 'A', bold: true, color: '#ff0000' },
    { text: 'B', bold: true, dimColor: true, color: '#010203' },
    { text: 'CD' },
    { text: 'E', backgroundColor: '#808080' },
  ])
})


test('with nothing stored the band is the engine alone', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  expect((await ui.findAll({ type: 'Text' })).map(text => text.text)).toEqual(['engine'])
  await ui.unmount()
})

