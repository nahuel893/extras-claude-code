# summarize

A Claude Code mod that writes a short summary of the session when you ask for one: the goal, what
happened, the decisions taken and where things stand, in about 150 words. Handy as a recap to come
back to, instead of scrolling up to find an old reply.

Nothing runs on its own. You type `/summ` when you want the summary written or brought up to date.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install summarize --marketplace nahuel893/extras-claude-code
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session). From a shell: `claude plugin install summarize --marketplace nahuel893/extras-claude-code`.

## Usage

Type `/summ`. The command answers `Summarizing the session…` right away and the work goes on in the
background, so you can keep typing:

1. The mod reads this session's conversation: your messages and Claude's replies, text only, up to
   the last 60,000 characters or so.
2. It asks a model for a narrative summary of it, written in the language you talk to Claude in.
3. It writes the summary to the session's file, replacing the previous one.

A toast says `Summary updated` when it is done, or why it was not (the model call failed, or its
reply was empty). A failed run leaves the previous summary as it was.

## Where the summary lives

One file per session, named after the session id:

```
~/.cache/extras-claude-code/summaries/<session id>.md
```

The [openskin](../openskin) mod shows it in its status panel.

## Options

Change them with `/plugin configure summarize@extras-claude-code`.

| Option | Default | What it does |
| --- | --- | --- |
| `model` | `claude-haiku-5-5` | The model that writes the summary: an alias such as `haiku` or a full model id. |

Each summary is one model call on your own Claude Code credentials.

## Development

```bash
claude plugin test .
claude plugin validate .
```

## License

MIT
