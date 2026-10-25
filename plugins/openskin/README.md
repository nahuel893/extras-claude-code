# openskin

An OpenCode-style look for the Claude Code terminal transcript, as a Claude Code mod.

- Your prompts sit in a full-width block with an accent bar down the left edge.
- Tool calls, their results and errors get blocks of their own, with a quieter bar.
- Claude's replies are drawn without a bullet, on a background band of their own.
- Shell commands in a reply are framed, so they stand apart from the prose.
- Each turn closes with a footer: `▣ Claude · <model> · <duration>`.

- In fullscreen, a status panel docks beside the transcript: your status line script's output, one row per part, and under it how full the context window is, each turn's tokens and your subscription's 5-hour and weekly windows.

Every color is an option, and each part (the OpenCode look, the command frames, the status panel) can be switched off on its own.

Unofficial: not affiliated with OpenCode or Anthropic.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install openskin --marketplace nahuel893/extras-claude-code
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session).

From a shell:

```bash
claude plugin install openskin --marketplace nahuel893/extras-claude-code
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `nahuel893/extras-claude-code`, then Add plugin.

## Options

Change them with `/plugin configure openskin@extras-claude-code`. A color is a hex such as `#f0a6ec`, a color name, or a Claude Code theme key such as `bashBorder`.

| Option | Default | What it does |
| --- | --- | --- |
| `opencodeStyle` | `true` | The OpenCode look: prompt, tool and error blocks, the reply band, the turn footer. |
| `commandFrames` | `true` | Frames the shell commands in Claude's replies and asks Claude to tag them as shell blocks. |
| `statusPanel` | `true` | The status panel beside the transcript in fullscreen; `/panel` opens it. |
| `contextWarnAt` | `50` | The context fill, in percent, from which the panel's Context section turns yellow (time to `/compact`). |
| `contextDangerAt` | `75` | The context fill from which it turns red (compact now or start a new session). |
| `accent` | `#f0a6ec` | The bar beside your prompts and the square in the footer. |
| `surface` | `#24242c` | The background of the prompt, tool and error blocks. |
| `toolBar` | `#55555f` | The bar beside tool calls and their results. |
| `error` | `#ff6b5b` | The bar beside error rows. |
| `muted` | `#7f7f8a` | The footer's model and duration, and the text of error rows. |
| `command` | `bashBorder` | The frame and label of shell commands. |
| `background` | `#1c1c22` | The band behind Claude's replies; `none` draws no band. |

With `opencodeStyle` off and `commandFrames` on, Claude Code keeps its own transcript and only the commands are framed. With both off, the mod draws nothing.

## Status panel

In the fullscreen layout the panel opens by itself beside the transcript (`/panel` opens it anywhere). It runs `~/.claude/statusline.sh` and draws each ` | ` separated part on its own row, leaving out the `5h:` and `7d:` parts and the context bar, which the Usage and Context sections replace. Under the rows, each section once it has something to show:

- **Context**: how full the context window is, gray, yellow from `contextWarnAt` and red from `contextDangerAt`. Before the session's first response it is counted once as `/context` does and shown with a `~`.
- **Tokens**: the last turn's input (`↑`), output (`↓`) and cache tokens, then the session's running total.
- **Usage**: the subscription's 5-hour and weekly windows, a bar yellow from 75% and red from 90%, and the time until each resets. Every open session shares the latest reading. Off a subscription there is nothing to show.

### Feeding the panel from your status line script

The panel reads the input Claude Code last gave your script, so the script has to keep it. Add this near the top of `~/.claude/statusline.sh`, after it reads stdin into `$input`:

```bash
SESSION_ID=$(jq -r '.session_id // empty' <<<"$input")
if [ -n "$SESSION_ID" ]; then
  OPENSKIN=~/.cache/openskin
  mkdir -p "$OPENSKIN/sessions" &&
    printf '%s' "$input" >"$OPENSKIN/sessions/$SESSION_ID.json.tmp" &&
    mv -f "$OPENSKIN/sessions/$SESSION_ID.json.tmp" "$OPENSKIN/sessions/$SESSION_ID.json"
  # Docked, the panel shows the status line: leave Claude Code's own one empty.
  [ -z "$OPENSKIN_PANEL" ] && [ -e "$OPENSKIN/docked/$SESSION_ID" ] && exit 0
fi
```

Once the panel docks it creates `~/.cache/openskin/docked/<session id>`, and the last line keeps the status line under the prompt empty for that session; the panel runs the script with `OPENSKIN_PANEL=1` to get the lines it draws. Drop that line to keep both. To make fullscreen the default for every session, set `"tui": "fullscreen"` in `~/.claude/settings.json`.

## Limits

A mod can only restyle what Claude Code lets it draw. The prompt input box has no hook, so its look follows `/theme`. Rows the engine draws itself (the spinner, system notices) keep their own look.

## Development

```bash
claude plugin test .
claude plugin validate .
```

## Credits

The panel's Context, Tokens and Usage sections are ported from three mods of [better-claude](https://github.com/midudev/better-claude) by Miguel Ángel Durán (midudev), MIT License: [context-meter](https://github.com/midudev/better-claude/tree/main/plugins/context-meter), [token-meter](https://github.com/midudev/better-claude/tree/main/plugins/token-meter) and [sub-meter](https://github.com/midudev/better-claude/tree/main/plugins/sub-meter). Their license and which files hold their code are in [NOTICE](NOTICE).

## License

MIT
