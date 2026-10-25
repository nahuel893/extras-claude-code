# board + summarize

## Objective
Two new manual mods in extras-claude-code, `board` (living done/pending/waiting list per project) and `summarize` (narrative summary per session), shown in openskin's status panel.

## Why
The user wants recaps and to-dos pinned as reference and kept current, instead of scrolling back to an old reply.

## Scope (approved in chat, 2026-10-25)
- `plugins/board`: `/board` reads this session's conversation, asks a model (default `claude-haiku-5-5`, configurable) to rewrite the board from the previous board plus the conversation. Lines `✓ done`, `○ pending`, `◇ waiting on a decision`. Stored per project: `~/.cache/extras-claude-code/board/<project slug>.md`. Runs in the background, toast when done. Manual only.
- `plugins/summarize`: `/summ` writes a narrative summary of the session (goal, what happened, decisions, where it stands), default model `claude-haiku-5-5`, configurable. Stored per session: `~/.cache/extras-claude-code/summaries/<session id>.md`. Background, toast. Manual only.
- Content written in the conversation's language.
- Independent: no dependency between the mods or on openskin.
- openskin panel: sections `≡ Board` and `¶ Summary` drawn from those files when they exist, refreshed when a file changes. Existing sections get icons: `◔ Context`, `⇅ Tokens`, `◷ Usage`. No emoji.

## Constraints
- Conventional commits, no AI attribution / Co-Authored-By.
- Artifacts in English.
- Mod rules: one hook per event per module; no engine node under a Box with `width`; plugin names must not start with `claude-`; `read`/`update` only atoms defined in the same module.

## Tasks
- [x] T1 board mod + tests + README + marketplace entry — route: delegated (writer trigger, 2+ non-trivial files) — commit f209787; RED seen (9 fail on stubs), GREEN 9 pass, validate passed
- [x] T2 summarize mod + tests + README + marketplace entry — delegated — commit 3188f95; RED 8 fail on stubs, GREEN 8 pass, validate passed
- [x] T3 openskin panel sections + icons + tests + README + version 0.7.0 — delegated — commit b85c461; RED 6 fail (new notes tests + renamed headings), GREEN 66 pass, validate passed with the 2 pre-existing warnings (no author, no icon)
- [x] T4 root README table rows for both mods — delegated (with T1/T2) — folded into f209787 and 3188f95
- [x] T5 panel redesign as cards (Gentle Pi style): round border with the title in its top edge, new ✿ Status card (project dir, git branch, changes, then the script rows), Board counter `≡ Board · <done> of <total>` with done items struck through — delegated (writer trigger: statusline, notes, new project module, tests, README) — commit b04bdc3; RED 4 fail (status module missing, 3 notes tests), GREEN 82 pass, validate passed (2 pre-existing warnings)
- [x] T6 `panelBackground` option (default `none`): paints the Pane root Box, `minHeight` = `scroll.bodyRows`; `/skin` presets leave it alone (UNSKINNED) — delegated (same writer, scope added by the user, separate commit) — commit 6bd9e70; RED 1 fail (paint test without the fill), GREEN 84 pass, validate passed
- [x] T7 Context card as the status line's ten-cell bar in theme colors (filled accent / `warning` / error, empty `muted`, `(tokens/window)` when known, `~` kept) — delegated (same writer) — commit 521902b; RED 6 fail, GREEN 85 pass, validate passed
- [x] T8 cards stacked with no blank row (gap 1 -> 0) — delegated (same writer) — commit fed6d07; RED 1 fail, GREEN 86 pass, validate passed, checked in a real session
- [ ] T9 Board/Summary titles missing in the user's live session — NOT reproduced: fresh sessions (tall, short/overflowing, scrolled, 50-col dock, summary created and grown while open, the live session's own board and summary text) all draw both titles. No fix commit. Needs: does it persist after restarting the session, and dock width.

## Checks
`claude plugin test .` and `claude plugin validate .` in each touched plugin folder.

## Progress / evidence
- Branch `feat/board-summarize` created from main `290ca67`.
- T1 done: f209787 (board mod, root README row folded in). Background work runs on `$.clock.after(0)` from `command.run`; `$.fs.write` creates parent dirs itself.
- T2 done: 3188f95 (summarize mod, root README row folded in).
- T3 done: b85c461. New `hooks/notes.tsx` (atoms `board`, `summary`; polled on the REFRESH_MS timer, mtime-gated). Board rows wrap as well as the summary (a cut item is useless in a narrow dock). ✓ mark uses `theme.muted`.
- T5: title overlay is an absolute Box (`top={0} left={2} right={2}`), a sibling after the bordered Box inside an unbordered wrapper. Inside the bordered Box (`top={-1}`) it was clipped: a Box clips children to the inside of its border. The test kit does not paint; checked in a real session (tmux capture).
- T5 git policy: Git runs on the panel's existing 1.5 s timer: when the status line input changes, else every 10th tick (15 s); `git --no-optional-locks status --porcelain=v2 --branch --untracked-files=all` + `git diff --numstat HEAD`; untracked files count as files, not lines. Atom `project` in `types/index.d.ts`.
- T6: in a real session the engine's pane frame stays grey (256-color 235) on the divider column, the close-mark row at the top and the last row of the dock; the body is painted.
- Next: native review / PR decision is the user's. Nothing pushed.
- Engram mirror: pending (Engram fails with ambiguous_project from this setup).
