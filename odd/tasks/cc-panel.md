# cc-panel

## Objective

`/cc` stops drawing in the band above the prompt. It opens a pane that takes the keyboard at once (a dialog), bigger than the band, where the person browses the shell commands Claude gave, message by message. Supersedes `cc-dialog-band`.

## Design (decided by the maintainer)

1. A message is everything Claude answered to one prompt: all blocks of that turn. Commands carry a prompt counter (`turn`, bumped in `prompt.submit`). Atom shape tag `commands-2`.
2. `/cc` opens on the latest message that has commands; messages without commands are skipped.
3. Inside a message, commands go in appearance order, numbered 1..k.
4. Header: `Commands`, `message i of N`, and `‹` `›` Buttons (older / newer) with letter hotkeys, clickable and reachable by the ring.
5. Each command is a row Button (Enter or click copies; digits 1-9 copy command n). A preview shows the focused command whole. The filter Input narrows within the shown message.
6. After a copy: close the pane and toast `Copied #n`. Esc closes without copying.
7. `/cc <n>` copies command n of the latest message with commands.
8. The band drawing and its dead state (`isOpen`) are removed. One /cc UI only.
9. `$.ui.open({ id, focus, closeOnEscape, holdToasts, columns: 80, rows })`.

## Scope

Allowed edit surfaces: `plugins/command-register/**`, `.claude-plugin/marketplace.json`, `CLAUDE.md`, this file.

## Tasks

- [x] T1 Message grouping, order and storage: `turn` on each command, `shape` bump, `/cc <n>` on the latest message. Route: inline (one mod, one bounded writer already; pure logic).
- [x] T2 The pane: `$.ui.open`, `Pane` render, band removal. Route: inline.
- [x] T3 Navigation (`‹ ›` and hotkeys), digits, copy and close. Route: inline.
- [x] T4 README, CLAUDE.md line and test count, version 0.3.0 (plugin.json, marketplace.json). The README says clicks need fullscreen (`"tui": "fullscreen"`), where the pane sits in fullscreen (docked beside the transcript, a tab next to openskin's panel) and that outside fullscreen it is inline and the keyboard works. Route: inline.
- [x] T5 Keep the register in a per-session file (`~/.cache/refined-claude-code/projects/<cwd slug>/<session id>/commands.json`): write-through after an append that adds commands and after a /clear; restore at `session.start` into an empty register, with the turn counter at the highest stored turn. Live testing showed `$.state` is lost when Claude Code goes to the background. Route: inline (one mod). Evidence: RED 5 of 6 new tests failed (the sixth, no write without commands, passes trivially); GREEN 42 pass; `claude plugin validate` passed. Commits: 832a7f2 (behavior and tests), 5b3d975 (README, CLAUDE.md), 4e7c1d1 (version 0.4.0).

## Checks

`claude plugin validate plugins/command-register`, `claude plugin test plugins/command-register`. Test-first: RED then GREEN per behavior.

## Progress

Branch `feat/cc-panel`. Engram mirror `odd/cc-panel/tasks`: PENDING.

## Commits

(filled per task)
- 363d034 feat(command-register): group commands by message (turn) (T1). RED: 2 of 4 new tests failed; GREEN: 36 pass.
- ca2fcaf feat(command-register): open /cc as a focused pane, drop the band (T2). RED: 9 of 20 failed; GREEN: 20 pass. Band tests replaced by pane tests.
- e25b6d9 feat(command-register): switch messages with ‹ › and copy by digit (T3). RED: 7 of 31 failed; GREEN: 30 pass.
- b6e9ad3, 50232aa chore: version 0.3.0 (plugin.json, marketplace.json).
- docs commit (T4): README, CLAUDE.md line and test count (30).

## Decisions

- Shape migration: commands-1 held no turn, so it is dropped (the atom declines it), not migrated.
- Hotkeys: h older, l newer. The Input keeps every printable key while it holds the ring, and a Button hotkey acts only when a Button holds it, so letters and digits do not fight the filter. The filter is not auto-focused.
- Engine limits: the test kit has no $.ui.close, so the ui.close reset hook is not covered by a test. tsc not run (not installed).
