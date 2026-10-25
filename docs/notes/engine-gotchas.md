# Engine gotchas

What building these mods taught about the Claude Code mod engine. Each item cost a debugging session once.

## Loading

- `hooks/hooks.json` takes exactly one module. A mod that needs more hooks keeps them in that one module.
- One hook per event per module, with two exceptions: a second `session.start` hook with the matcher `{ isInteractive: true }`, and several `command.run` hooks with different `{ command }` matchers.
- Plugin names starting with `claude-` are reserved by the validator.
- `read` and `update` only accept atoms defined in the same module.
- `rg` skips the hidden `.claude-plugin/` folder unless it is named explicitly.

## Rendering

- Render hooks can run before `session.start` finishes. Never latch a one-shot flag on values `session.start` sets; retry on a later draw instead (see openskin's docked mark).
- Never put an engine node (`await next(e)`) under a `Box` with `width`.
- Two mods on the same `ui.render` site have no guaranteed order: keep one owner per site.
- The prompt input box has no render site.
- A `Box` clips its children to the inside of its border. To put a title on a card's border, draw it as an absolutely positioned sibling after the bordered `Box`, inside a wrapper with no border.
- The engine's docked pane frame is its own grey; a mod can only paint inside it (openskin's `panelBackground`).
- `$.ui.open` docks a pane only in fullscreen (`/tui fullscreen`). An unasked open needs at least 144 columns, 110 once the person asked for it.

## Runtime

- Background work goes on `$.clock.after(0)` from `command.run`, so the command answers at once.
- `$.fs.write` creates parent directories.
- `$.config.set({ key, value })` reloads the module with the new options.
- A session follows outside edits of `settings.json`, through a symlink too, and reloads plugins whose options changed. But a session started while the file was a regular file stops seeing edits once it is replaced by a symlink.
- In such a stale session, `$.config.set` writes the session's whole stale copy of the settings back to disk, reverting newer outside edits.
- `/reload-plugins` re-reads the settings without writing anything. A mod can trigger it with `$.command.run({ command: 'reload-plugins' })`, but not from inside its own `command.run` hook: schedule it with `$.clock.after`.
- Several `$.config.set` calls in a row from one command hook all finish before the engine reloads the module.

## Tests

- Test stand-ins answer `{ value }` or `{ deny }`.
- `$.clock` needs `mock.clock`.

## Developing

- Install the repository as a folder marketplace (`claude plugin marketplace add <path to the repo>`): edits plus `/reload-plugins` apply with no reinstall.
