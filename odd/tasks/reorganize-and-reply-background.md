# opentheme: reorganize the mod and add a reply background

Locator: `odd/tasks/reorganize-and-reply-background.md` (repo `~/.claude/mods/opentheme`, branch `feat/reorganize-and-reply-background`).

## Objective

Turn `reply-style` into `opentheme`, a git repository whose hooks module is split into two
parts, the OpenCode look and the shell command frames, each behind its own switch. Add a
`background` color drawn behind Claude's replies.

## Why

The mod is growing: a sidebar and a command register are next. One 285-line module with every
feature in it is hard to extend and to publish. The person also wants Claude's replies to sit on a
background of their own, as OpenCode's do.

## Scope

- Rename folder, manifest, marketplace entry and system-prompt section id to `opentheme`.
- Split `hooks/register.tsx` into `theme.ts` (colors, options), `opencode.tsx` (look), `commands.tsx`
  (fence parsing, frames, the fence rule) and a thin `register.tsx`.
- Two switches: `opencodeStyle` and `commandFrames`, both on by default.
- A `background` color option painted behind each reply.

Out of scope: the sidebar, the command register (a separate mod), the below-prompt line, publishing.

## Constraints

- One mod draws `AssistantMessage`: two mods on the same render site have no fixed order.
- With `opencodeStyle` off and `commandFrames` on, prose keeps the engine's drawing and only the
  commands are framed.
- Default look stays as 0.4.0 except for the new background.
- Artifacts in English; Conventional Commits; no AI attribution in commits.

## Tasks

- [x] T1 Rename to `opentheme` (manifest 0.5.0, marketplace entry, section id, tests) and reinstall. Route: inline (mechanical, known edits).
- [x] T2 Split the module into theme/opencode/commands/register with the two switches, tests first. Route: delegated writer (4+ non-trivial files).
- [x] T3 `background` option behind replies, tests first. Route: delegated writer (same files as T2).

## Acceptance criteria

- `claude plugin test .`, `claude plugin validate .` and `tsc -p .` pass.
- Installed as `opentheme@local-mods` at user scope; `reply-style@local-mods` removed.
- Each switch turns its part off alone; both off draws the engine's transcript.
- Replies draw on the `background` color, with the side gutters the blocks use.

## Checks

`claude plugin test .` · `claude plugin validate .` · `npx -y -p typescript@5.6.3 tsc -p .`

## Progress

- Baseline commit `3f992b8` on `main` (reply-style 0.4.0 as found).
- Name `claude-open-theme` refused by `claude plugin validate` (reserved `claude-` prefix); the person chose `opentheme`.
- T1 done in `d3d1b0e`: 18 tests pass, validate passes with directory-only warnings (README, LICENSE, icon), tsc clean. Reinstalled as `opentheme@local-mods` (user scope), `reply-style@local-mods` uninstalled. Review assess: medium, not due (under_budget).
- T2 + T3 done in `a014221` (one commit: same files). RED first: 7 switch tests, 6 background tests. 33 tests pass, validate passes (directory warnings only), tsc clean. Switches are boolean userConfig; `background` default `#1c1c22`, `none` paints nothing.
- Open: with opencodeStyle off, a reply that opens with a command loses its bullet; command spacing in that mode not yet seen in a real session.
- Engram mirror pending: `mem_save` answered ambiguous_project with unrelated projects.

## Next step

T1.
