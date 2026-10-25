# command-register

A Claude Code mod that keeps a numbered register of every shell command Claude gives you in the
session, so you can copy one to the clipboard without selecting it with the mouse.

The mod fills the register itself by reading Claude's replies as they are stored. The model is never
asked to keep it: it costs no tokens and nothing gets forgotten.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install command-register --marketplace nahuel893/refined-claude-code
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session). From a shell: `claude plugin install command-register --marketplace nahuel893/refined-claude-code`.

## Usage

| You type | What happens |
| --- | --- |
| `/cc` | A framed list opens above the prompt, newest command first. Press a row's digit to copy that command and close the list. |
| `/cc <n>` | Copies command `n` right away, for example `/cc 3`. |

The list is a rounded dialog in the band above the prompt, with `Commands` and `<shown> of <total>` on its border:

```
╭─ Commands ─────────────────────────── 3 of 12 ──╮
│ filter: piper_                                  │
│   1: yay -S --mflags --skipchecksums piper-tts  │
│ ▶ 2: yay -S piper-voices-es-ar                  │
│   3: spd-say -w -l es-ar "Hola, soy el narrador"│
│ ┄ preview ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │
│ yay -S piper-voices-es-ar                       │
│ 1-9 copy · ctrl+x tab to browse · 0: close      │
╰─────────────────────────────────────────────────╯
```

- `1` to `9` copy that row's command. Type the digit in the empty prompt, with no focus step needed.
- `0` closes the list. So does sending your next prompt or command.
- `▶` marks the selected row and the preview shows its command whole, wrapped, a few lines at most.
  Without focus the selection is row 1.
- Press `ctrl+x tab` (or click a row) to give the keyboard to the list. Then Tab and the arrows walk
  the rows and the marker and preview follow, Enter copies the focused row, and typing filters the
  list through the filter field. Esc gives the keys back to the prompt.
- The hint line changes with who holds the keyboard, and gets shorter in a narrow band.
- The list shows up to nine commands, fewer when the band above the prompt is short. The filter
  matches anywhere in the command, ignoring case. Older ones stay in the register: copy them with
  `/cc <n>`.
- A row shows the command's first line, with `…` when it has more lines. The whole command is copied.

## What counts as a command

The rule is the same one the openskin mod uses to frame commands:

- a closed fenced block tagged with a shell language: `bash`, `sh`, `zsh`, `shell`, `console`,
  `fish`, `terminal` or `shellsession`;
- an untagged fence whose first non-blank line starts with `!`, `$ ` or `sudo `.

What gets copied is the block as written, with one change: a leading `$ ` on any line is removed,
because it is a prompt shown to the reader and not part of the command. A leading `!` is kept,
because it is Claude Code's own prefix for running a command at its prompt.

The register counts only commands from the main conversation, never from subagents. It starts over
after `/clear`. Replies from before a `--resume` are not counted again: a resumed transcript is
loaded, not replied.

## Keyboard shortcut

A mod cannot add keybindings. You can add these to `~/.claude/keybindings.json` yourself.

**Open the list with a key.** Claude Code's keybinding schema accepts `command:<name>` as an action,
which "executes the slash command as if typed". The binding has to be in the `Chat` context:

```json
{
  "$schema": "https://www.schemastore.org/claude-code-keybindings.json",
  "$docs": "https://code.claude.com/docs/en/keybindings",
  "bindings": [
    {
      "context": "Chat",
      "bindings": {
        "ctrl+x c": "command:cc"
      }
    }
  ]
}
```

With that binding, `ctrl+x c` and then `1` copies the newest command. `ctrl+x c` is free among the
default bindings.

**Focus the list.** Focusing the list is the built-in action `abovePrompt:focus`, bound to
`ctrl+x tab` by default in the `Chat` context. You don't need it for the digits. Rebind it only if
you want a different key for the ring.

**Optional: walk the rows with up and down.** Inside the focused band, up and down may scroll it
instead of moving the ring, depending on your bindings; Tab always moves between rows. To make up and
down move between rows, add this block. It applies to every plugin's band, not only this one:

```json
{
  "context": "AbovePrompt",
  "bindings": {
    "down": "abovePrompt:next",
    "up": "abovePrompt:previous"
  }
}
```

## Limits

- Esc does not close the list. Esc gives the keys back to the prompt, but the band above the prompt
  doesn't tell a mod when that happens, so the hint may keep showing the focused keys until you
  close the list with `0` or send your next prompt.
- A mod cannot take the keyboard: the list takes keys only after `ctrl+x tab` or a click.
- Each copy goes to the clipboard of the surface you are using. In a terminal this uses the
  machine's clipboard tool, or OSC 52 when there is none.

## License

MIT
