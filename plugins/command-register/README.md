# command-register

A Claude Code mod that keeps a register of every shell command Claude gives you in the
session, so you can browse them message by message and copy one to the clipboard without selecting it with the mouse.

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
| `/cc` | Opens the command panel on Claude's latest message that has commands. It takes the keyboard at once. |
| `/cc <n>` | Copies command `n` of that latest message right away, for example `/cc 3`. |

A message is everything Claude answered to one prompt of yours, all its blocks (the text before a
tool call too). The panel shows one message at a time, with its commands in the order they appeared,
numbered from 1:

```
Commands  h: ‹ message 3 of 12 l: ›
filter: piper_
▶ 1: yay -S --mflags --skipchecksums piper-tts
  2: yay -S piper-voices-es-ar
  3: spd-say -w -l es-ar "Hola, soy el narrador"
┄ preview ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
yay -S --mflags --skipchecksums piper-tts
↑↓ move · enter or 1-9 copy · h/l message · esc close
```

- `‹` shows the older message and `›` the newer one. Click them, reach them with Tab, or press `h`
  (older) and `l` (newer). Messages without commands are skipped, and the header counts only the
  ones that have commands.
- `1` to `9` copy that row's command; so does Enter on the focused row, or a click on it. After a
  copy the panel closes and a `Copied #n` toast says what went to the clipboard.
- Esc closes the panel without copying.
- `▶` marks the selected row and the preview shows its command whole, wrapped, a few lines at most.
  Until you move, the selection is row 1.
- Tab and the arrows walk the buttons and the filter field. Typing in the filter narrows the shown
  message (anywhere in the command, ignoring case); Enter there copies the first match. Switching
  message clears the filter. While the filter field holds the keys every printable key goes to it,
  so `h`, `l` and the digits only act when a button holds the ring.
- Only the first nine rows have a digit. Further rows show their number and are reached by Tab, a
  click or the filter. With a filter on, a digit is the row's place in the filtered list.
- A row shows the command's first line, with `…` when it has more lines. The whole command is copied.

### Where the panel sits, and the mouse

- **Fullscreen** (`"tui": "fullscreen"` in `~/.claude/settings.json`, or `/tui fullscreen`): the
  panel docks beside the transcript, up to 45% of the terminal wide, from 110 columns. When openskin's
  status panel is open too, the two become tabs of one dock and only one shows: close `/cc` and the
  other comes back. **Mouse clicks on the panel (rows, `‹`, `›`) need this fullscreen layout.**
- **Outside fullscreen** the panel sits inline above the prompt, as tall as its content. The
  keyboard works the same there (digits, Enter, `h`/`l`, Tab, Esc); only clicks need fullscreen.

## Where the register is kept

The register is written to `~/.cache/refined-claude-code/projects/<cwd slug>/<session id>/commands.json`
(the cwd slug is the working directory with every `/` replaced by `-`) each time it changes: after
a reply that adds commands and after a `/clear`, which writes an empty list. It survives sending
Claude Code to the background and a restart of the same session id: at session start, an empty
register is loaded from that session's file, with the message counter, so new replies do not join an
old message. Only the current session's file is ever read. A missing or corrupt file means an empty
register, and a failed write only shows one toast.

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

A mod cannot add keybindings. You can add this one to `~/.claude/keybindings.json` yourself.
Claude Code's keybinding schema accepts `command:<name>` as an action, which "executes the slash
command as if typed". The binding has to be in the `Chat` context:

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

With that binding, `ctrl+x c` and then `1` copies the newest message's first command. `ctrl+x c` is
free among the default bindings.

## Limits

- The panel asks for the keyboard when it opens, but Claude Code grants it only while the prompt has
  the keys over an empty composer. Otherwise it opens without them: press `ctrl+x tab` or click it.
- The older stored register (before 0.3.0) had no message boundaries, so it is dropped on update:
  commands from before the update are not listed.
- Each copy goes to the clipboard of the surface you are using. In a terminal this uses the
  machine's clipboard tool, or OSC 52 when there is none.

## License

MIT
