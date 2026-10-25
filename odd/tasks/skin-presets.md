# /skin presets (approved 2026-10-25)

Next after board-summarize lands: `/skin` in openskin. `/skin` opens a picker, `/skin <name>` applies one: sets openskin's color options via `$.config.set({ key: 'openskin.<field>', value })` and Claude Code's built-in `theme`.

Hex values come from the agent's recall of each official palette, not fetched; spot-check nord and tokyonight muted contrast.

| Preset | theme | accent | surface | toolBar | error | muted | command | background |
|---|---|---|---|---|---|---|---|---|
| default | dark | #f0a6ec | #24242c | #55555f | #ff6b5b | #7f7f8a | bashBorder | #1c1c22 |
| tokyonight | dark | #bb9af7 | #1f2335 | #414868 | #f7768e | #737aa2 | #7dcfff | #16161e |
| catppuccin-mocha | dark | #cba6f7 | #313244 | #585b70 | #f38ba8 | #9399b2 | #94e2d5 | #181825 |
| catppuccin-latte | light | #8839ef | #ccd0da | #acb0be | #d20f39 | #5c5f77 | #179299 | #e6e9ef |
| gruvbox-dark | dark | #fabd2f | #3c3836 | #665c54 | #fb4934 | #a89984 | #8ec07c | #1d2021 |
| nord | dark | #88c0d0 | #3b4252 | #4c566a | #bf616a | #81a1c1 | #a3be8c | #2e3440 |
| rose-pine | dark | #c4a7e7 | #26233a | #403d52 | #eb6f92 | #908caa | #9ccfd8 | #191724 |
| rose-pine-dawn | light | #907aa9 | #f2e9e1 | #cecacd | #b4637a | #797593 | #56949f | #faf4ed |
| kanagawa-wave | dark | #d27e99 | #2a2a37 | #54546d | #e46876 | #938aa9 | #7fb4ca | #16161d |
| everforest | dark | #a7c080 | #343f44 | #475258 | #e67e80 | #9da9a0 | #83c092 | #232a2e |
| one-dark | dark | #61afef | #2c313c | #3e4451 | #e06c75 | #828997 | #56b6c2 | #21252b |

Sources: opencode.ai/docs/themes, catppuccin.com/palette, folke/tokyonight.nvim, morhetz/gruvbox, nordtheme.com, rosepinetheme.com, rebelot/kanagawa.nvim, sainnhe/everforest, atom one-dark-ui.
