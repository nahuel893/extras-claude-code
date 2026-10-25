# Board agent tool

## Objective
Let the main Claude agent keep the session board itself: add tasks when it starts work, mark them done or waiting when they change, at a small and bounded token cost.

## Problem
Today the board only changes when the maintainer runs `/board` and Haiku rewrites it. Claude Code's to-do tool is not available in the maintainer's setup, so nothing tracks work as it happens.

## Why
The board (part 1, `odd/tasks/session-scoped-notes.md`) is now per session and per project. This is part 2 of 3: Claude maintains it. Part 3 (keynotes mod + Notes card) comes later.

## Scope (approved in chat, 2026-10-25)
- A model tool registered by the board mod through `$.tool.register` (served by a `tool.call` hook), named `board`, full name `mcp__board__board` (confirm the exact name the engine returns). Actions: `add <text>` (appends a pending item, returns its number), `done <n>`, `wait <n>`. It writes the session board file directly in the existing format (`✓` done, `○` pending, `◇` waiting), so the openskin panel shows changes with no openskin change. Replies are short, e.g. `ok · 2 of 5 done`.
- Option 1, rules: the tool description says when to use it (multi-step work, not trivial tasks; mark items done as soon as they finish). MCP tools may be deferred (the model sees only the name until ToolSearch), so a one-line hint is added at session start through `additionalContext` naming the tool and when to use it.
- Option 2, reminders: when the board has pending items and Claude has not called the tool for N user turns (option `reminderTurns`, default 5), inject one line through `additionalContext` on the next prompt, e.g. `Board: 3 pending. Mark finished items done with the board tool.` When the board file changed outside the tool (for example after `/board`), inject the numbered list once so Claude has the current numbers.
- Lock between `/board` and the tool: while `/board` waits on its model, tool calls wait instead of writing. When it finishes, `add` applies; `done n` and `wait n` issued before the rewrite are rejected with the new numbered list and a request to call again.
- `/board` itself is unchanged apart from taking the lock.

## Out of scope
- Option 3 (automatic Haiku reconciliation at `Stop`): rejected in chat as overengineering. `/board` is the manual safety net.
- openskin changes, keynotes, Notes card.

## Constraints
- Conventional commits, one concern per commit, no AI attribution or Co-Authored-By.
- Artifacts in English. Test-first: RED, then GREEN.
- board version 0.2.0 -> 0.3.0 in `plugins/board/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`.
- RDD is off by the maintainer's choice.
- Token budget: the session-start hint and each reminder stay at one short line; the numbered list is injected only after an outside change.

## Delivery
- Strategy: ask-on-risk. Forecast about 300-450 authored changed lines (tool, reminders, lock, tests, docs). If the running count passes about 400, ask before the next commit.

## Tasks
- [x] T1 board tool: register `board` with `add`/`done`/`wait`, write the session board file, short replies, tests — route: delegated (writer trigger, 2+ non-trivial files); commit 3717d7a; RED 5 fail (10 pass), GREEN 15 pass, validate passed, tsc not run (no engine types laid); tool name `mcp__board__board`
- [x] T2 hint and reminders: session-start hint, `reminderTurns` option (default 5), reminder line, numbered list after an outside change, tests — route: delegated (same writer); commit ccd0071; RED 6 fail (16 pass), GREEN 22 pass, validate passed, tsc not run (no engine types laid); context goes through `classic.SessionStart` / `classic.UserPromptSubmit` `additionalContext`
- [x] T3 lock: `/board` and the tool serialize; stale `done`/`wait` rejected with the new list, tests — route: delegated (same writer); design revised by the maintainer for the 10 s hook budget: a call polls `$.clock.sleep(250)` up to min(7 s, remaining budget − 2 s), then replies `/board is rewriting the board, call again shortly.` and writes nothing; /board awaits the tool's writes in flight before reading; staleness = board content differs from what Claude last saw, `/board` generation picks the message; `add` applies and its reply carries the new list; commit 4e0d133; RED 5 fail (22 pass), GREEN 28 pass (3 T1 tests now first let Claude see the on-disk board through a prompt, plus one hand-edit test), validate passed, tsc not run (no engine types laid)
- [x] T4 docs and version: board README (tool, option, lock), CLAUDE.md Mods line, version 0.3.0 — route: delegated (same writer); commits e2851fe (chore: 0.3.0 in plugin.json and marketplace.json), 67e0a1d (docs(board): README, CLAUDE.md board line, test count 28), 38c9fae (docs: engine gotchas on the 10 s hook budget and top-level `$` functions); validate passed (plugin and marketplace, pre-existing warnings only), tests 28 pass, tsc not run

## Acceptance criteria
- Claude can add, finish and park items without reading or editing the file.
- With pending items and no tool call for `reminderTurns` turns, one reminder line is injected; none when nothing is pending.
- After `/board` rewrites the board, Claude receives the numbered list once.
- A `done n` racing a `/board` never writes over the rewrite and is rejected with the new list.
- `claude plugin validate plugins/board` and `claude plugin test plugins/board` pass.

## Checks
- `claude plugin validate plugins/board`
- `claude plugin test plugins/board`
- `tsc -p plugins/board` once engine types exist in `plugins/board/.claude-plugin/types/` (not available so far)

## Progress
- 2026-10-25: branch `feat/board-agent-tool` created from `main` at bafd045. Document created.
- 2026-10-25: T1 done (3717d7a). Running authored changed lines: 193.
- 2026-10-25: T2 done (ccd0071). Running authored changed lines: 392. Paused before T3: the count reaches the ~400 ask-on-risk threshold, and the engine bounds a hook's own time to 10 s per dispatch (`HookBudget.ms`; awaiting a plain promise counts, only `next` and `$` calls are free), so a `tool.call` hook cannot wait out a `/board` model call of up to 120 s as T3 specifies.
- 2026-10-25: maintainer approved continuing past ~400 lines (single PR) and a bounded-wait T3. T3 done (4e0d133), T4 done (e2851fe, 67e0a1d, 38c9fae). Total authored changed lines bafd045..HEAD: 716 (695 insertions, 21 deletions).

## Next step
All tasks done. Next: the maintainer's live check in a session (`/reload-plugins`, confirm the tool is listed as `mcp__board__board`, the session-start hint, and a `/board` race), then merge or PR under ordinary policy.
