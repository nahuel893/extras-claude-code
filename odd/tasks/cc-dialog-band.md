# cc-dialog-band

## Objective

Restyle the command-register `/cc` list as a rounded, titled dialog that stays in the band above the prompt (not a pane: a pane docks beside the transcript in wide fullscreen, which is not wanted).

## Mockup (approved)

```
 ╭─ Commands ─────────────────────────── 3 of 12 ──╮
 │ filter: piper_                                  │
 │   1  yay -S --mflags --skipchecksums piper-tts  │
 │ ▶ 2  yay -S piper-voices-es-ar                  │
 │ ┄ preview ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │
 │ yay -S piper-voices-es-ar                       │
 │ ↑↓ move · enter copy · type to filter · esc back│
 ╰─────────────────────────────────────────────────╯
```

## Scope

Allowed edit surfaces: `plugins/command-register/{hooks,tests,types/index.d.ts,README.md,.claude-plugin/plugin.json}`, `.claude-plugin/marketplace.json`, `CLAUDE.md`, this file.

## Constraints

- Keep: `/cc` opens the band; a bare digit copies the row through the Button `hotkey`; `0` closes; `/cc <n>` copies directly.
- Max 9 rows, newest first, cut to `bodyColumns` with an ellipsis.
- No title-on-border in `Box`: title and count are absolutely positioned siblings after the bordered Box (engine-gotchas).
- Focus is only the person's (ctrl+x tab or click); follow the ring through `ui.focus`.
- Colors: Claude Code theme keys, no openskin dependency.
- Test-first, RED then GREEN. Conventional commits, no AI attribution.
- ~400 changed lines per task is a planning heuristic only.

## Tasks

- [x] T1 Tests for the render (frame, count, marker, preview, hint per focus state, filter, 9-row cap, width cut) and handlers; observe RED. Route: inline (single mod, one bounded writer already).
- [x] T2 Implement register.tsx (atoms `focusKey`, `filter`; `ui.focus` hook; Input; preview); GREEN.
- [x] T3 Bump command-register 0.1.0 -> 0.2.0 (plugin.json, marketplace.json).
- [x] T4 README and CLAUDE.md (bullet, test count).

## Acceptance

- Mockup layout renders in the band; existing digit/hotkey/`/cc <n>` behaviour intact.
- `claude plugin validate plugins/command-register`, `claude plugin test plugins/command-register`, `claude plugin validate .` pass. `tsc` not installed.

## Progress

Branch `feat/cc-dialog-band`. Engram mirror: `odd/cc-dialog-band/tasks` (PENDING: Engram refused project `refined-claude-code` as unknown; not saved under another project).

## Commits

- feat(command-register): draw /cc as a framed dialog in the band (T1+T2). RED: 12 of 32 failed before register.tsx changed; GREEN: 32 pass.
- chore(command-register): bump to 0.2.0 (T3).
- docs(command-register): document the dialog (T4).
