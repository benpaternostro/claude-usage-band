<div align="center">

# usage-band

**Context window and plan limits, always in view, in a band above the Claude Code prompt.**

[![Release](https://img.shields.io/github/v/release/benpaternostro/claude-usage-band?label=release&color=d97757)](https://github.com/benpaternostro/claude-usage-band/releases/latest)
[![License: MIT](https://img.shields.io/github/license/benpaternostro/claude-usage-band?color=blue)](LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-2.1.275%2B-d97757)](https://docs.anthropic.com/en/docs/claude-code)
[![Plugin](https://img.shields.io/badge/type-function--hook%20mod-8a63d2)](#install)
[![Surfaces](https://img.shields.io/badge/surfaces-terminal%20%7C%20desktop-2ea44f)](#where-it-works)
[![Last commit](https://img.shields.io/github/last-commit/benpaternostro/claude-usage-band)](https://github.com/benpaternostro/claude-usage-band/commits/main)

<sub>Unofficial. This project is not affiliated with or endorsed by Anthropic. Claude is a trademark of Anthropic.</sub>

<br>

<img src="docs/band.png" alt="The usage band above the prompt in the desktop Code tab: the Context, Session and Weekly meters drawn as rings, the branch, and the cache countdown">

<sub>Desktop Code tab</sub>

<img src="docs/cli-band.webp" alt="The usage band above the prompt in the terminal">

<sub>Terminal</sub>

</div>

## Quick start

In a Claude Code session, run:

```
/plugin install usage-band --marketplace benpaternostro/claude-usage-band
```

Confirm the marketplace source, choose an installation scope, and start a new session.

## Features

| Meter | Shows |
| --- | --- |
| **Context** | How full the context window is. The drawer breaks it down by category, coloured as `/context` shows it |
| **Session** | The 5-hour plan limit and the time until it resets |
| **Weekly** | The 7-day plan limit and the time until it resets |
| **Credits** | The spend limit, when your plan has one |
| **Branch** | The session's git branch (a short commit hash when detached), shown from its last `/`: `feature/NEXT-1777` shows as `NEXT-1777`. Hover it for the full name. The desktop shows a branch icon (a fork icon in a linked worktree); the terminal shows `git main`, and `· worktree` in a linked worktree |
| **Cache** | Estimated prompt-cache time remaining, after a clock icon on the desktop (`Cache` in the terminal), to the left of the `＋` toggle |

A meter's fill turns amber at 80% of its limit and red at 95%. For the context, the limit is the auto-compact point, or the full window when auto-compact is off.

The cache countdown starts after a main-conversation response uses or writes the cache. It counts whole minutes (`59m`), then seconds in the last minute. The countdown uses your cache TTL settings. Without an explicit setting, it estimates the TTL from the plan limits. `—` means no cache time is available. A model switch or compaction clears the estimate. See [Claude Code cache lifetimes](https://code.claude.com/docs/en/prompt-caching#cache-lifetime).

When the band is too narrow, the bars shrink first. On the desktop, bars that would be too short to read turn into small rings. Then the branch is shortened with `…`, and then it is dropped. If the band is still too narrow, meters drop whole from the right, so items never overlap. The branch refreshes when the session starts and after each turn.

Click a meter or the `＋` toggle to open the **drawer**. It shows the full context breakdown, the space left before auto-compact, the session cost, and a **Compact session** button.

The context breakdown is a local estimate. It sends no API request.

<details open>
<summary><b>The drawer</b></summary>
<br>

![The open drawer in the desktop Code tab](docs/drawer.png)

![The open drawer in the terminal](docs/cli-drawer.webp)

</details>

## Why a band and not a status line

A status line is one line of text below the prompt. The band sits above the prompt and is built from plugin UI, so it can do more:

- **You can click it.** A meter opens the drawer with the full context breakdown, the session cost and a **Compact session** button.
- **It draws real UI on the desktop.** In the desktop Code tab, the meters are bars and rings in the app's own colours.
- **It makes no network requests of its own.** The usage figures come from Claude Code through the plugin API. There is nothing else to install.
- **It leaves your status line alone.** The mod does not use the `statusLine` setting, so a status line you already have keeps working.

## Where it works

| Surface | Status |
| --- | --- |
| Terminal, including the VS Code integrated terminal | ✅ Supported. The bars are drawn as text. Click a meter's label or figures, or `＋`, to open the drawer. |
| Desktop app, Code tab | ✅ Supported |
| VS Code extension | ❌ Not supported. The extension loads the mod and runs its hooks, but it draws no plugin UI: neither the band nor a status line. Tested on extension 2.1.291. |

## Requirements

- Claude Code 2.1.275 or later. The mod was tested on 2.1.288.
- The terminal or the desktop Code tab.

> [!WARNING]
> The function-hook plugin API is in early access. It can change between Claude Code releases without notice.

## Install

### From the marketplace

From your shell, the install is two commands:

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

To load more than one folder, separate the paths with `:` on macOS and Linux, or with `;` on Windows.

> [!IMPORTANT]
> Do not load the mod from a folder and also install it from the marketplace. Use one method only.

Claude Code writes the API type declarations into `.claude-plugin/types/` when it loads the mod from a folder. These files are not in the repository.

## Develop

```bash
claude plugin validate .
```

```bash
claude plugin test .
```

When you load the mod from a folder, it reloads in a running terminal session after you save `hooks/register.tsx`. In the desktop app, set `CLAUDE_CODE_PLUGIN_DIR_WATCH=1` in the same `env` block to get this behaviour, or start a new session.

### Layout

| Path | Contents |
| --- | --- |
| `hooks/register.tsx` | The hooks: usage refresh, band and drawer rendering |
| `hooks/cache.ts` | Cache TTL estimate and countdown text |
| `hooks/git.ts` | Branch and worktree detection |
| `hooks/fit.ts` | Band width budget: bar widths, rings and branch shortening |
| `.claude-plugin/marketplace.json` | The marketplace entry for `/plugin install` |
| `types/index.d.ts` | Snapshot types and plugin state declarations |
| `tests/band.test.ts` | Helper, git and render tests |
| `tests/cache.test.mjs` | Cache countdown tests (`node --test`) |
| `tests/fit.test.mjs` | Width budget tests (`node --test`) |

## License

[MIT](LICENSE)
