# summarize

A Claude Code mod that writes a short summary of the session when you ask for one: the goal, what
happened, the decisions taken and where things stand, in about 150 words. Handy as a recap to come
back to, instead of scrolling up to find an old reply.

Nothing runs on its own. You type `/summ` when you want the summary written or brought up to date.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install summarize --marketplace nahuel893/refined-claude-code
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session). From a shell: `claude plugin install summarize --marketplace nahuel893/refined-claude-code`.

## Usage

Type `/summ`. The command answers `Summarizing the session…` right away and the work goes on in the
background, so you can keep typing:

1. The mod reads this session's conversation: your messages and Claude's replies, text only, up to
   the last 60,000 characters or so.
2. It asks a model for a narrative summary of it, written in the language you talk to Claude in.
3. It writes the summary to the session's file under its project, replacing the previous one.

A toast says `Summary updated` when it is done, or why it was not (the model call failed, or its
reply was empty). A failed run leaves the previous summary as it was.

## Where the summary lives

One file per session, in a folder per project. The project's folder is the session's working
directory with every `/` turned into `-`, and the session's folder is its id:

```
~/.cache/refined-claude-code/projects/<slug>/<session id>/summary.md
```

For a session `abc-123` in `/home/user/projects/app` that is
`~/.cache/refined-claude-code/projects/-home-user-projects-app/abc-123/summary.md`. The
[board](../board) mod writes its `board.md` in the same session folder, and the
[openskin](../openskin) mod shows both in its status panel.

Version 0.1.0 wrote `~/.cache/extras-claude-code/summaries/<session id>.md`. Those files are no
longer read, moved or deleted.

## Options

Change them with `/plugin configure summarize@refined-claude-code`.

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
