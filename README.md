# usage-band

A Claude Code mod that shows a usage band above the prompt, in the terminal and in the desktop Code tab.

The band shows:

- **Context**: how full the context window is, coloured by category as `/context` shows it.
- **Session**: the 5-hour plan limit, with the time until it resets.
- **Weekly**: the 7-day plan limit, with the time until it resets.
- **Credits**: the spend limit, when your plan has one.

Click a meter or the `＋` toggle to open the drawer. The drawer shows the full context breakdown, the space left before auto-compact, the session cost, and a **Compact session** button.

The context breakdown is a local estimate. It sends no API request.

## Requirements

- A Claude Code version that supports function-hook mods.

> The function-hook plugin API is in early access. It can change between Claude Code releases without notice.

## Install

1. Clone this repository:

   ```bash
   git clone https://github.com/benpaternostro/claude-usage-band.git ~/.claude/mods/usage-band
   ```

2. Add the folder to `CLAUDE_CODE_PLUGIN_DIRS`, then start a new Claude Code session.

Claude Code writes the API type declarations into `.claude-plugin/types/` when it loads the mod. These files are not in the repository.

## Develop

```bash
claude plugin validate .
```

```bash
claude plugin test .
```

The mod hot-reloads in a running session when you change `hooks/register.tsx`.

## Layout

| Path | Contents |
| --- | --- |
| `hooks/register.tsx` | The hooks: usage refresh, band and drawer rendering |
| `types/index.d.ts` | Snapshot types and plugin state declarations |
| `tests/band.test.ts` | Helper and render tests |

## License

MIT
