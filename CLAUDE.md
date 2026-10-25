# extras-claude-code

Claude Code mods (function-hooks plugins) published as one marketplace. Public repository, MIT.

## Layout

- `.claude-plugin/marketplace.json`: marketplace `extras-claude-code`, one entry per mod with its version. Bump the version here and in the mod's own `plugin.json` together.
- `plugins/<mod>/`: one mod per folder. Each has `.claude-plugin/plugin.json`, `hooks/hooks.json` (exactly one module, usually `./register.tsx`), `hooks/*.tsx`, `tests/*.test.tsx`, `types/index.d.ts` when it keeps `$.state`, and a `README.md`.
- `docs/notes/engine-gotchas.md`: what the mod engine does that is not obvious. Read it before touching render or loading code.
- `odd/tasks/<feature>.md`: one ODD feature document per feature (objective, scope, checklist with task IDs, evidence, commits). `odd/handoff-*.md`: session handoffs with the state of work in flight.
- `assets/`: README banner (`banner.png`, Cascadia Code on the Rose Pine palette) and screenshot.

## Mods

- **openskin**: the OpenCode look for the transcript (barred prompts and tool calls, reply band, framed shell commands, footer), every color an option. It also owns:
  - the status panel docked beside the transcript in fullscreen. It is built from cards with the title on the border: Status (project, branch, changes), Context (a ten-cell bar in theme colors), Tokens, Usage, Board, Summary. Unicode icons, never emoji: `◔ ⇅ ◷ ≡ ¶`.
  - `/panel`, which opens the panel below 144 columns.
  - `/skin`, which offers 11 theme presets and writes the colors through `$.config.set`.
  - `panelBackground`, which paints inside the engine's grey pane frame.
- **command-register**: `/cc` lists the shell commands Claude gave, and a digit copies one; `/cc <n>` copies command n.
- **board**: `/board` asks a model (Haiku by default, configurable) to rewrite a done `✓` / pending `○` / waiting `◇` list per project into `~/.cache/extras-claude-code/board/<cwd slug>.md`.
- **summarize**: `/summ` asks a model (Haiku by default, configurable) for a session summary in `~/.cache/extras-claude-code/summaries/<session id>.md`.

board and summarize are independent of openskin. The panel only reads their files and redraws when they change.

## The status line contract (openskin panel)

The panel reuses the user's status line script, which lives outside this repo:

- The script saves each session's JSON input to `~/.cache/openskin/sessions/<session_id>.json`.
- Once docked, openskin touches `~/.cache/openskin/docked/<session_id>`. Then the script prints only one line under the prompt: model | vim mode | cost | time | effort | style.
- The panel runs the script with `OPENSKIN_PANEL=1` to get the rest: repo, worktree, agent, fast mode, version. It drops 5h/7d and the context bar, which have their own cards.
- The reference script and the desktop theme switcher (`theme-switch.sh`: kitty, sway, and openskin colors in one command, with a fuzzel picker) are in the maintainer's dotfiles, not here.

## Working here

- Install the repo as a folder marketplace. After that, edits plus `/reload-plugins` apply with no reinstall.
- Check every mod you touch:
  - `claude plugin validate plugins/<mod>`
  - `claude plugin test plugins/<mod>`
  - `tsc -p plugins/<mod>`, once the engine has laid the types in `.claude-plugin/types/` (gitignored).
- Test-first for behavior changes. Observe RED, then GREEN. Regression tests sit next to the code they guard.
- Last known test counts: openskin 86, command-register 17, board 9, summarize 8.
- Artifacts (code, comments, docs, commit messages) are in English.

## Commits and publishing

- Conventional Commits, imperative, under 72 characters. One concern per commit: never mix a feature, a style tweak and docs in one commit. No AI attribution or Co-Authored-By trailers.
- Work on a branch, then merge to `main`. Push only when the maintainer says so.
- The repository is public. Before every push, scan the diff for private data: absolute home paths, user names, hostnames, emails, tokens, internal URLs. Run the scan as a separate step that must pass, never chained with `;` before `git push`. A home path reached GitHub once that way.
- Example paths in docs use a generic home, like `/home/user`.
