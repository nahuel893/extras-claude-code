<p align="center"><img src="assets/banner.png" alt="extras-claude-code" width="100%"></p>

# extras-claude-code

Mods for [Claude Code](https://claude.com/claude-code) that make its terminal interface nicer to live in. Each one installs on its own.

| Mod | What it does |
| --- | --- |
| [openskin](plugins/openskin) | An OpenCode-style look for the transcript: your prompts and tool calls in barred blocks, Claude's replies on a band of their own, framed shell commands and a `▣ Claude · model · time` footer. Every color is an option. |
| [command-register](plugins/command-register) | Every shell command Claude gives goes into a numbered register. `/cc` lists them above the prompt and a digit copies one; `/cc <n>` copies command n. No more selecting commands with the mouse. |
| [board](plugins/board) | A living board per project: `/board` asks a model to rewrite the list of what is done (`✓`), pending (`○`) and waiting on your decision (`◇`) from the conversation, and keeps it in a file the openskin panel shows. |
| [summarize](plugins/summarize) | `/summ` asks a model for a short summary of the session (the goal, what happened, the decisions, where it stands) and keeps it in a file per session that the openskin panel shows. |

![openskin's docked status panel beside a session](assets/screenshot.jpeg)

Unofficial: not affiliated with Anthropic or OpenCode.

## Install

Add the marketplace once, at the prompt of a Claude Code terminal session:

```
/plugin marketplace add nahuel893/extras-claude-code
```

Then install the mods you want:

```
/plugin install openskin@extras-claude-code
/plugin install command-register@extras-claude-code
/plugin install board@extras-claude-code
/plugin install summarize@extras-claude-code
```

From a shell, the same steps are `claude plugin marketplace add nahuel893/extras-claude-code` and `claude plugin install <mod>@extras-claude-code`.

Each mod's README lists its options and limits.

## Recommended

[**better-claude**](https://github.com/midudev/better-claude) by [Miguel Ángel Durán (midudev)](https://github.com/midudev) is a great collection of Claude Code mods: a prompt queue, one-turn Haiku and max-effort prefixes, token, subscription and context meters, image previews, a git snapshot of every turn, and more. Install it alongside these:

```
/plugin marketplace add midudev/better-claude
```

## Development

Each mod lives in `plugins/<mod>/` with its own tests:

```bash
cd plugins/openskin && claude plugin test . && claude plugin validate .
```

## License

MIT
