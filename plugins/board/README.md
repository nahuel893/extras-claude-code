# board

A Claude Code mod that keeps a living board per session: what is done, what is pending and what
waits on your decision, pinned in a file under the project instead of buried in an old reply.

```
✓ Parser written and tested
○ Add the config loader
◇ Pick the cache directory: ~/.cache or XDG_CACHE_HOME
```

Nothing runs on its own. You type `/board` when you want the board brought up to date.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install board --marketplace nahuel893/extras-claude-code
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session). From a shell: `claude plugin install board --marketplace nahuel893/extras-claude-code`.

## Usage

Type `/board`. The command answers `Updating the board…` right away and the work goes on in the
background, so you can keep typing:

1. The mod reads this session's conversation: your messages and Claude's replies, text only, up to
   the last 60,000 characters or so.
2. It reads this session's previous board, if there is one. A new session starts from an empty board.
3. It asks a model to rewrite the board from both: still-valid items kept, finished ones marked done,
   new ones added, about 15 items at most, written in the language you talk to Claude in.
4. It keeps only the lines that start with a mark and writes the file.

A toast says `Board updated` when it is done, or why it was not updated (the model call failed, or
its reply held no board lines). A failed update leaves the previous board as it was.

Each line starts with one mark:

| Mark | Meaning |
| --- | --- |
| `✓` | Done |
| `○` | Pending |
| `◇` | Waiting on your decision |

## Where the board lives

One file per session, in a folder per project. The project's folder is the session's working
directory with every `/` turned into `-`, and the session's folder is its id:

```
~/.cache/extras-claude-code/projects/<slug>/<session id>/board.md
```

For a session `abc-123` in `/home/user/projects/app` that is
`~/.cache/extras-claude-code/projects/-home-user-projects-app/abc-123/board.md`. Each session keeps
its own board, and the file stays after the session ends, next to the other boards of the project.
The [summarize](../summarize) mod writes its `summary.md` in the same session folder, and the
[openskin](../openskin) mod shows both in its status panel.

Version 0.1.0 kept one board per project in `~/.cache/extras-claude-code/board/<slug>.md`. Those
files are no longer read, moved or deleted.

## Options

Change them with `/plugin configure board@extras-claude-code`.

| Option | Default | What it does |
| --- | --- | --- |
| `model` | `claude-haiku-5-5` | The model that rewrites the board: an alias such as `haiku` or a full model id. |

Each update is one model call on your own Claude Code credentials.

## Development

```bash
claude plugin test .
claude plugin validate .
```

## License

MIT
