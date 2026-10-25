# openskin

An OpenCode-style look for the Claude Code terminal transcript, as a Claude Code mod.

- Your prompts sit in a full-width block with an accent bar down the left edge.
- Tool calls, their results and errors get blocks of their own, with a quieter bar.
- Claude's replies are drawn without a bullet, on a background band of their own.
- Shell commands in a reply are framed, so they stand apart from the prose.
- Each turn closes with a footer: `▣ Claude · <model> · <duration>`.

Every color is an option, and each of the two parts (the OpenCode look and the command frames) can be switched off on its own.

Unofficial: not affiliated with OpenCode or Anthropic.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install openskin --marketplace nahuel893/openskin-claude-code
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session).

From a shell:

```bash
claude plugin install openskin --marketplace nahuel893/openskin-claude-code
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `nahuel893/openskin-claude-code`, then Add plugin.

## Options

Change them with `/plugin configure openskin@openskin`. A color is a hex such as `#f0a6ec`, a color name, or a Claude Code theme key such as `bashBorder`.

| Option | Default | What it does |
| --- | --- | --- |
| `opencodeStyle` | `true` | The OpenCode look: prompt, tool and error blocks, the reply band, the turn footer. |
| `commandFrames` | `true` | Frames the shell commands in Claude's replies and asks Claude to tag them as shell blocks. |
| `accent` | `#f0a6ec` | The bar beside your prompts and the square in the footer. |
| `surface` | `#24242c` | The background of the prompt, tool and error blocks. |
| `toolBar` | `#55555f` | The bar beside tool calls and their results. |
| `error` | `#ff6b5b` | The bar beside error rows. |
| `muted` | `#7f7f8a` | The footer's model and duration, and the text of error rows. |
| `command` | `bashBorder` | The frame and label of shell commands. |
| `background` | `#1c1c22` | The band behind Claude's replies; `none` draws no band. |

With `opencodeStyle` off and `commandFrames` on, Claude Code keeps its own transcript and only the commands are framed. With both off, the mod draws nothing.

## Limits

A mod can only restyle what Claude Code lets it draw. The prompt input box has no hook, so its look follows `/theme`. Rows the engine draws itself (the spinner, system notices) keep their own look.

## Development

```bash
claude plugin test .
claude plugin validate .
```

## License

MIT
