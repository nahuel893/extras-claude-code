# Session-scoped board and summary

## Objective
Key the board and the summary by project and session, so each session has its own board (a persistent to-do for that session) and its own summary, both findable under the project.

## Problem
Today the board is per project (`board/<cwd slug>.md`, shared by every session) and the summary is per session (`summaries/<session id>.md`, with no project). Neither matches how the maintainer works: a board that belongs to one session, kept after it ends, grouped by project.

## Why
Claude Code's to-do tool is not available in the maintainer's setup. The board fills that gap, with two things the to-do lacked: it survives the session and it is grouped by project. This is part 1 of 3; part 2 (Claude strikes board items) and part 3 (keynotes mod + Notes card with cycling and scroll in openskin) build on these paths.

## Scope (approved in chat, 2026-10-25)
- New layout, shared by all three mods: `~/.cache/refined-claude-code/projects/<cwd slug>/<session id>/board.md` and `.../summary.md`. The slug is the cwd with every `/` replaced by `-`, as today.
- board: `/board` reads and rewrites this session's board only. A new session starts with an empty board (decision taken by the assistant, reversible: the maintainer did not answer whether a new session should inherit the previous one's pending items).
- summarize: `/summ` writes this session's summary under its project.
- openskin: the panel reads the current session's board and summary from the new paths.
- Old files (`board/<slug>.md`, `summaries/<id>.md`) are not read, moved or deleted.

## Out of scope
- Claude striking board items (part 2).
- keynotes mod, Notes card, cycling, scroll (part 3).
- Inheriting pending items across sessions.

## Constraints
- Conventional commits, one concern per commit (feature, docs and chores apart), no AI attribution or Co-Authored-By.
- Artifacts in English. Test-first: RED, then GREEN.
- Bump each mod's version in its `plugin.json` and in `.claude-plugin/marketplace.json` together.
- RDD is off by the maintainer's choice.

## Delivery
- Strategy: ask-on-risk. Forecast about 150-250 authored changed lines, under the 400-line budget: one PR.

## Tasks
- [x] T1 board: session-scoped path, empty board per new session, tests, README, version 0.2.0 — route: delegated (writer trigger, 3 mods with 2+ non-trivial files) — commit 547823f (code), a6cf298 (docs); RED 4 fail / 6 pass, GREEN 10 pass, validate passed, tsc not run (no engine types in `plugins/board/.claude-plugin/types/`, no `tsc` on PATH)
- [x] T2 summarize: session-scoped path under the project, tests, README, version 0.2.0 — route: delegated (same writer) — commit 308fd28 (code), 75b5b52 (docs); RED 3 fail / 6 pass (after a first RED where the file did not load for the missing `slugOf` export), GREEN 9 pass, validate passed, tsc not run (no engine types in `plugins/summarize/.claude-plugin/types/`, no `tsc` on PATH)
- [x] T3 openskin: panel reads the new paths, tests, README, version 0.8.0 — route: delegated (same writer) — commit 8484c4b (code), 724e1bc (docs); RED 4 fail / 94 pass, GREEN 98 pass, validate passed with the 2 pre-existing warnings, tsc not run (no engine types in `plugins/openskin/.claude-plugin/types/`, no `tsc` on PATH). `statusline.tsx` unchanged: the `notePaths`/`startNotes` signatures already took the session id.
- [x] T4 CLAUDE.md and root README: describe the new layout — route: delegated (same writer) — commit 555c572; structural readback only (passive docs), home-path scan clean; CLAUDE.md test counts updated to openskin 98, board 10, summarize 9

- [x] T5 rename to `refined-claude-code` (approved in chat, 2026-10-25): marketplace name, cache root `~/.cache/refined-claude-code/` in board, summarize and openskin, install commands and repo URLs in READMEs and CLAUDE.md. Historical docs (`odd/handoff-*.md`, `odd/tasks/board-summarize.md`) stay as written. GitHub repo rename, local folder move and the user's settings (`enabledPlugins`, `extraKnownMarketplaces`, `openskin@extras-claude-code` options) are outside the repo and follow after merge — route: delegated (writer trigger, 15 files) — commits f85f931 (cache root + tests; RED board 4 fail / 6 pass, summarize 2 fail / 7 pass, openskin 3 fail / 95 pass; GREEN 10, 9, 98), 7ae3ef1 (marketplace name + follow test fixture; `follow.ts` matches any `openskin@*` id), da11eba (READMEs, CLAUDE.md). The board and summarize READMEs keep the real 0.1.0 paths under `~/.cache/extras-claude-code/`, since that is where 0.1.0 wrote. Validate passed for all four mods and the marketplace root; tsc not run.

## Acceptance criteria
- Two sessions in the same project write two distinct boards and summaries under `projects/<slug>/`.
- `/board` in a fresh session does not see another session's board.
- The panel shows the current session's board and summary, and nothing from other sessions.
- Each touched mod: `claude plugin validate`, `claude plugin test`, `tsc -p` pass (openskin's `tests/status.test.tsx` has 7 pre-existing type errors).

## Checks
- `claude plugin validate plugins/<mod>`
- `claude plugin test plugins/<mod>`
- `tsc -p plugins/<mod>`

## Progress
- 2026-10-25: branch `feat/session-scoped-notes` created from `main` at 7f17a75. Document created.
- 2026-10-25: T1 done. `boardPath(home, cwd, id)` writes `projects/<slug>/<id>/board.md`; a fresh session reads no other board.
- 2026-10-25: T2 done. `summaryPath(home, cwd, id)` writes `projects/<slug>/<id>/summary.md`.
- 2026-10-25: T3 done. openskin `notePaths` reads `projects/<slug>/<id>/{board,summary}.md`; a test shows other sessions' and old files are not drawn.
- 2026-10-25: T4 done. CLAUDE.md and root README describe the new layout.
- 2026-10-25: T5 done. Marketplace `refined-claude-code`, cache root `~/.cache/refined-claude-code/`, docs renamed.
- Open: `tsc -p` could not run for any mod (engine types not laid, `tsc` not installed); run it once a session has loaded the mods.

## Next step
Run `tsc -p` per mod once the engine has laid the types, reload the plugins and try `/board` and `/summ` in two sessions of one project, then decide on merging to `main`. After merge, outside the repo: rename the GitHub repo and the local folder, and update `enabledPlugins`, `extraKnownMarketplaces` and the `openskin@...` options in the user's settings to `refined-claude-code`.
