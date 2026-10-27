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

- [ ] T1 Message grouping, order and storage: `turn` on each command, `shape` bump, `/cc <n>` on the latest message. Route: inline (one mod, one bounded writer already; pure logic).
- [ ] T2 The pane: `$.ui.open`, `Pane` render, band removal. Route: inline.
- [ ] T3 Navigation (`‹ ›` and hotkeys), digits, copy and close. Route: inline.
- [ ] T4 README, CLAUDE.md line and test count, version 0.3.0 (plugin.json, marketplace.json). The README says clicks need fullscreen (`"tui": "fullscreen"`), where the pane sits in fullscreen (docked beside the transcript, a tab next to openskin's panel) and that outside fullscreen it is inline and the keyboard works. Route: inline.

## Checks

`claude plugin validate plugins/command-register`, `claude plugin test plugins/command-register`. Test-first: RED then GREEN per behavior.

## Progress

Branch `feat/cc-panel`. Engram mirror `odd/cc-panel/tasks`: PENDING.

## Commits

(filled per task)
