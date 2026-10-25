# Transcript scrollbar

## Objective
A clickable scrollbar for the transcript: a one-character column on the left edge of the openskin status panel, between the transcript and the panel's cards. A track plus a thumb shows which part of the conversation the viewport shows; clicking a cell jumps the transcript to the message at that proportional height.

## Problem
Scrolling far up a long session with the wheel or PageUp is slow. The engine has no draggable scrollbar and no mouse-driven jump.

## Scope (approved in chat, 2026-10-25)
- Column on the panel's left edge, in the theme's colors (`theme.muted` track, `theme.accent` thumb), one `Button` per cell.
- Position tracking: openskin's `ui.render` hooks on transcript rows record each row's `onScreen` (which of its rows the viewport shows, and the row's whole extent `of`) in a tracker shared with the panel. Message order is the order rows were first seen.
- Click a cell: top cell = first message, bottom cell = latest message, others = the message at that proportional height (weighted by known row extents), through `$.ui.scroll({ to: { requestId } })` from the Button's `onPress`.
- A `deny` (a message outside the rows the transcript keeps drawn, or any refusal) is handled with a toast, never a crash.
- No dragging (the engine has none in a pane). Wheel and PageUp/PageDown are left alone.
- openskin 0.8.1 -> 0.9.0; README and CLAUDE.md document it.

## Constraints
- `$.ui.scroll` with `to: 'end'` and `in` is for a plugin's own sites (pane ids, the band), not the transcript: the bottom cell scrolls to the last known message with `block: 'end'`.
- A transcript row scrolls only while the call answers the person's own input (the `onPress`).
- A render hook cannot write state: a timer bumps an atom when the tracker changed, which redraws the panel.
- Functions that receive `$` are top level. New `$.state` values are declared in `types/index.d.ts`.
- Conventional commits, one concern per commit, no AI attribution or Co-Authored-By. Artifacts in English. No private paths.
- Test-first: RED, then GREEN. ~400 authored changed lines per task is a heuristic only.

## Tasks
- [x] T1 tracker, position math and column: pure `scrollbar.tsx` (tracker, thumb cells, click target, jump with deny handling, column drawing), recorded from the row hooks, drawn at the left of the panel, tests; commit 794bee1; RED: scrollbar.test.tsx failed to load (module missing), 98 pass 1 fail; GREEN 118 pass; tsc not run (not installed)
- [x] T2 version: 0.9.0 in `plugins/openskin/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`; commit 1f7c02b
- [x] T3 docs: README status panel section, CLAUDE.md openskin bullet and test count 118; commit e10551d

Route: delegated writer (bounded writer worker; multi-file).

## Acceptance criteria
- Thumb cells follow the viewport reported through `onScreen`; the thumb is always at least one cell.
- Clicking cell 0 targets the first message, the last cell the latest message with `block: 'end'`, others the message at that height.
- A denied or failed scroll shows a toast and nothing throws.
- Row rewrites carry `onScreen` on unchanged (the hooks only read it).
- `claude plugin validate plugins/openskin`, `claude plugin test plugins/openskin`, `claude plugin validate .` pass.

## Checks
- `claude plugin validate plugins/openskin`
- `claude plugin test plugins/openskin`
- `claude plugin validate .`
- `tsc -p plugins/openskin` once engine types exist (not available here)

## Progress
- 2026-10-25: branch `feat/transcript-scrollbar` created. Document created. Engram mirror saved under topic `odd/transcript-scrollbar/tasks` (auto-detected project `extras-claude-code`; the name `refined-claude-code` was refused as unknown).
- 2026-10-25: T1-T3 done. Validate openskin and marketplace pass with warnings; tests 118 pass.
- Engine limits met: an imported function that receives `$` must be a function declaration; the test kit cannot stand in for `$.ui.scroll` on a transcript row (no implementation), so the click-to-jump is proven only against a fake `$`.

## Next step
Live check by the maintainer: click-to-jump on recent and very old messages (deny toast), thumb tracking while scrolling, row order as drawn on a resumed session, panel taller than the pane. Then merge or PR under ordinary policy.
