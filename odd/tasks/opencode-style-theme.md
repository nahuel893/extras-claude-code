# reply-style: OpenCode-style transcript, themeable

## Objective
Make Claude Code's transcript look like OpenCode's and let the person change its colors easily.

## Problem / why
The person finds the default CLI transcript visually careless. They showed two OpenCode screenshots and approved this description in chat (2026-10-25):
- Their prompts sit in a full-width block: a background a shade lighter than the terminal, a colored vertical bar on the left edge, one row of air above and below the text.
- Errors use the same block with a red bar and dim text.
- Claude's replies are part of the background: plain text, slightly indented, no box, no bullet.
- Tool calls and executed commands are a distinct block too (same background, a dimmer bar): `$ command`, its output, truncated with a hint to expand.
- Under each reply, a footer: `▣ Claude · <model> · <duration>` (square in the accent color, name bright, the rest dim).
- Shell commands Claude hands the person keep the existing framed highlight (`❯ command`).
- Every color comes from one place: the mod's options, editable from `/config`.

## Scope
In: UserMessage (prompts), tool rows, AssistantMessage, the turn footer, error rows if the API exposes a site for them, color options.
Out (non-goals for now): the prompt input box, thinking rows ("Thought: ..."), inline-code colors inside markdown, following Caelestia's scheme automatically (possible later).

## Constraints
- One mod (`reply-style`): two mods redrawing the same site have no fixed order.
- Rows that are expanded (ctrl+o, or `verbose`, which the person turned on) must still show in full.
- Artifacts (code, labels, comments) in English.

## Tasks
- [x] T1 Map the API sites and props for UserMessage, ToolUse/ToolResult/ToolGroup, TurnDuration, error rows, and where the model name comes from. Route: delegated writer (mapping folded into the writer; bounded rg + line ranges of the types file). Findings: UserMessage text/origin.kind/isExpanded (types 10285-10334); AssistantMessage text/isFirstOfReply/isSummary (10344-10375); ToolUse (10382), ToolResult (10450), ToolGroup isExpanded (10504-10521); CommandOutput isErrored (10554-10577); TurnDuration durationMs/isExpanded/waitingFor, terminal only (10662-10727); InfoNotice is a logo status line, not errors (10734); no site for API errors (rate limit, overloaded); model from `$.session.model()` (2846).
- [x] T2 Theme options in plugin.json (accent, surface, toolBar, error, muted, command) with OpenCode-like defaults; one theme object read from `options` (trimmed, blank = default). Version 0.3.0. Route: delegated writer.
- [x] T3 Prompt block (UserMessage, origins composer/bridge/sdk; text drawn by the mod in every view; other origins and empty text keep the engine drawing). Route: delegated writer.
- [x] T4 Plain assistant replies (no background, no bullet, paddingLeft 2, Markdown) keeping command highlight in the `command` color. Summary rows: engine drawing with `isFirstOfReply: false` (no bullet; its own 2-column gutter aligns it). Route: delegated writer.
- [x] T5 Tool block wrapping the engine's own tool drawing: ToolUse air above, ToolResult air below (adjacent rows read as one block); folded ToolGroup one block; unfolded group passes (its rows are ToolUse blocks). Route: delegated writer.
- [x] T6 Turn footer `▣ Claude · model · duration` (model formatted, e.g. claude-opus-5-5 -> Opus 5.5; omitted when unreadable; engine line kept while `waitingFor`). Route: delegated writer.
- [x] T7 Error block on CommandOutput rows with `isErrored` (a slash command that threw): error bar, muted text. No site exists for API errors. Route: delegated writer.
- [x] T8 Tests (claude plugin test), validate, tsc: done by the writer (see evidence); parent spot check 2026-10-25: `claude plugin test .` 15 pass 0 fail, validate passes (directory-only warnings), version 0.3.0 with the six color options. Pending: the person's visual confirmation in their terminal.

## Acceptance
- `claude plugin test .` all pass, with RED observed before each behavior.
- `claude plugin validate .` passes (directory-only warnings allowed).
- `npx -y -p typescript@5.6.3 tsc -p .` exits 0.
- The person sees it in their terminal and confirms.

## Checks / evidence
- RED (2026-10-25): new/updated tests written first; `claude plugin test .` -> 3 pass, 12 fail. Failing for the intended reasons: reply had no paddingLeft / still had background; summary got isFirstOfReply true; command color option ignored; options test had no UserMessage hook; prompt, tool, group, error rows drew the bare engine Text; footer drew the engine line. The 3 passing were pass-through guards (non-own prompts, waitingFor, list fences).
- GREEN: `claude plugin test .` -> 15 pass, 0 fail.
- `claude plugin validate .` -> "Validation passed with warnings" (ICON_MISSING only).
- `npx -y -p typescript@5.6.3 tsc -p .` -> exit 0.
- Not testable in the kit (no paint): whether the empty 1-column bar Box paints and stretches to the block height; whether the engine puts a blank row between a ToolUse row and its ToolResult row (would split the tool block in two); how much the engine's own row margins add around the blocks.

## Notes
- No git repository holds this mod, so there are no work-unit commits; recorded here instead.
- Engram mirror pending: Engram returns ambiguous_project when the session runs from the home directory.
