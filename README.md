# usage-band

A Claude Code mod that shows a usage band above the prompt, in the terminal and in the desktop Code tab.

> Unofficial. This project is not affiliated with or endorsed by Anthropic. Claude is a trademark of Anthropic.

![The usage band above the prompt](docs/band.png)

The band shows:

- **Context**: how full the context window is, coloured by category as `/context` shows it.
- **Session**: the 5-hour plan limit, with the time until it resets.
- **Weekly**: the 7-day plan limit, with the time until it resets.
- **Credits**: the spend limit, when your plan has one.

Click a meter or the `＋` toggle to open the drawer. The drawer shows the full context breakdown, the space left before auto-compact, the session cost, and a **Compact session** button.

![The open drawer with the context breakdown and plan limits](docs/drawer.png)

The context breakdown is a local estimate. It sends no API request.

### In the terminal

The terminal draws the bars as text. Click a meter's label or figures, or the `＋` toggle, to open the drawer.

![The usage band above the prompt in the terminal](docs/cli-band.webp)

![The open drawer in the terminal](docs/cli-drawer.webp)

### Not supported: the VS Code extension

The Claude Code extension for VS Code loads the mod and runs its hooks, but it does not draw plugin UI. It shows neither the band above the prompt nor a plugin status line. This was tested on extension 2.1.291. Use the terminal, including the VS Code integrated terminal, or the desktop Code tab.

## Requirements

- Claude Code 2.1.275 or later. The mod was tested on 2.1.288.
- The terminal or the desktop Code tab. The VS Code extension does not show the band.

> The function-hook plugin API is in early access. It can change between Claude Code releases without notice.

## Install

In a Claude Code session, run:

```
/plugin install usage-band --marketplace benpaternostro/claude-usage-band
```

Claude Code shows the marketplace source and asks you to confirm it. Then choose an installation scope. Start a new session to see the band.

From your shell, the same install is two commands:

```bash
claude plugin marketplace add benpaternostro/claude-usage-band
```

```bash
claude plugin install usage-band@claude-usage-band
```

To get a new version, run:

```bash
claude plugin update usage-band@claude-usage-band
```

### Try it for one session

Clone the repository, then start Claude Code with the folder:

```bash
git clone https://github.com/benpaternostro/claude-usage-band.git
```

```bash
claude --plugin-dir ./claude-usage-band
```

### Load it from a folder in every session

Use this method when you change the mod yourself, or in the desktop app, where you cannot give a command-line flag. Add the absolute path of the cloned folder to the `env` block of `~/.claude/settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "/Users/you/code/claude-usage-band"
  }
}
```

To load more than one folder, separate the paths with `:` on macOS and Linux, or with `;` on Windows. Do not load the mod from a folder and also install it from the marketplace. Use one method only.

Claude Code writes the API type declarations into `.claude-plugin/types/` when it loads the mod from a folder. These files are not in the repository.

## Develop

```bash
claude plugin validate .
```

```bash
claude plugin test .
```

When you load the mod from a folder, it reloads in a running terminal session after you save `hooks/register.tsx`. In the desktop app, set `CLAUDE_CODE_PLUGIN_DIR_WATCH=1` in the same `env` block to get this behaviour, or start a new session.

## Layout

| Path | Contents |
| --- | --- |
| `hooks/register.tsx` | The hooks: usage refresh, band and drawer rendering |
| `.claude-plugin/marketplace.json` | The marketplace entry for `/plugin install` |
| `types/index.d.ts` | Snapshot types and plugin state declarations |
| `tests/band.test.ts` | Helper and render tests |

## License

MIT
