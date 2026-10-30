# copy-button

Branch: `feat/copy-button` (from `main`). Engram mirror: `odd/copy-button/tasks` (project `extras-claude-code`), status: saved (observation 1020).

## Objective

Every framed shell command openskin draws in Claude's replies gets a clickable `[copy]` button. A click copies the whole command to the clipboard.

## Scope

Allowed: `plugins/openskin/hooks/**`, `plugins/openskin/tests/**`, `plugins/openskin/types/index.d.ts`, `plugins/openskin/README.md`, `plugins/openskin/.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `CLAUDE.md`, this file.

Constraints: functions that receive `$` are top-level declarations; hook budget 10 s; a Button raises `ui.press` only where the surface reports clicks (fullscreen terminal).

## Tasks

- [x] T0 gate: test that draws an AssistantMessage with a shell command, finds the copy Button and presses it. Unproven premise: the engine allows a Button in a transcript row.
- [x] T1 `[copy]` at the right end of the top border of each frame; press calls `$.ui.copy`; label becomes `copied` for 1.5 s; failure toasts the reason; stable unique key per command.
- [x] T1b hide the button where clicks are not reported. Flag: `RenderViewport.isFullscreen` (claude-code.d.ts, line 11069), carried on `e.viewport` of every `ui.render` event (line 10315). Hidden when it is `false`; drawn when it is `true` or absent (unknown).
- [x] T2 tests (RED then GREEN), README (must say plainly the button needs fullscreen, `"tui": "fullscreen"` in `~/.claude/settings.json`), CLAUDE.md openskin line and test count, minor version bump in `plugin.json` and `marketplace.json` (separate commit).

## Checks

`claude plugin validate plugins/openskin`, `claude plugin test plugins/openskin`.

## Progress

Route: one delegated writer (the parent delegated); inline edits here.

- T0 passed: the engine draws a Button inside an AssistantMessage and `ui.press` reaches its onPress (no refusal).
- Engine rule met on the way: `$` cannot be put in an object, and a helper that receives it must be a function declaration (drawCommand, drawReply, drawFramedCommands, pressCopy).
- Checks: `claude plugin test plugins/openskin` 126 pass, 0 fail; `claude plugin validate plugins/openskin` passed with warnings. `tsc` not installed here.
- Commits: 6685f77 feat(openskin): add a copy button to framed shell commands (T0, T1, T1b, tests, README, CLAUDE.md); 9ba578e chore(openskin): bump to 0.10.0.
