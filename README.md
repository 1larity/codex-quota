<p align="center"><img src="assets/logo.png" alt="Quota Monitor for Codex" width="640"></p>

# Quota Monitor for Codex

Show Codex quota usage in the VS Code status bar.

## Features

- See remaining quota in the VS Code status bar, with colour warnings when it runs low.
- Hover for usage windows and reset times.
- Refresh on demand or open the provider's usage page from the Command Palette.
- Adjust the refresh interval and warning thresholds.
- Optionally make quota information available to coding agents through MCP.

## Get started

1. Install **Quota Monitor for Codex** from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=RichardBeech.quota-monitor-codex). VS Code 1.74 or newer is required.
2. Install the official Codex CLI and sign in with `codex login`. The extension can also find Codex bundled with the OpenAI ChatGPT extension.
3. Look for **Codex** in the status bar. Hover for quota details and reset times; click to refresh or double-click to open the usage page.

If VS Code cannot find the CLI, set `codexQuota.codexPath` in your User settings to the executable's full path.

Open the Command Palette with `Ctrl+Shift+P` on Windows/Linux or `Cmd+Shift+P` on macOS and search for **Codex Quota** to find the available commands.

## Commands

- **Codex Quota: Refresh**
- **Codex Quota: Open Usage Page**
- **Codex Quota: Toggle MCP Server**

## Reading your quota

The status bar shows remaining percentages for available usage windows. Hover for more detail. By default, a red warning indicates less than 10% remaining, amber indicates less than 30%, and green indicates 30% or more. The most constrained window determines the colour. You can change the thresholds in Settings.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `codexQuota.codexPath` | `codex` | Path to the `codex` executable. Set this if VS Code does not inherit your shell `PATH`. |
| `codexQuota.refreshIntervalSeconds` | `60` | Refresh interval in seconds (minimum 15). |
| `codexQuota.thresholds` | `{ "redBelowPercent": 10, "amberBelowPercent": 30 }` | Color-band thresholds in percent remaining: below `redBelowPercent` shows the red tint, below `amberBelowPercent` the amber tint, otherwise green text. Red is checked first; values are clamped to 0–100. |
| `codexQuota.mcp.enabled` | `false` | Lets coding agents read this quota through the MCP server. Toggle it from the link at the foot of the status bar tooltip. |


## Troubleshooting

- A key icon and `Codex ?` means Codex is not signed in; run `codex login`.
- A warning icon means the last refresh failed; hover for the reason.
- If the executable cannot be found, check `codex --version` in a terminal and set `codexQuota.codexPath` in User settings.
- Check the **Codex Quota** output channel under **View > Output** for status messages.

## Privacy and access

The extension uses the local Codex app-server to retrieve rate limits. Purchased ChatGPT credits are available on the usage dashboard but are not exposed by the app-server. The extension sends no telemetry. Never include keys, tokens or account responses in bug reports.

This extension is disabled in untrusted and virtual workspaces.

## Licence

Copyright © 2026 Richard Beech / 1larity. User-owned code, documentation and assets
are licensed under [Creative Commons Attribution-NonCommercial-ShareAlike 4.0
International](https://creativecommons.org/licenses/by-nc-sa/4.0/)
(**CC BY-NC-SA 4.0**). Credit the author and source, link the licence, indicate
changes, use non-commercially and share adaptations under the same licence.
Third-party material retains its own terms; previous licence grants are not revoked.
See [LICENSE](LICENSE) for the legal text.

## JSON command line for coding agents

`codex-quota` prints the quota shown in the status bar as one JSON document, so an
agent can check its own limits before starting long work.

```sh
node cli.js --pretty        # from the extension folder
npx . --pretty              # or install the codex-quota command: npm link
```

Fields: `ok`, `provider`, `plan`, `band` (`green`, `amber` or `red`, from the
most constrained window), `status` (the status bar text) and `windows[]` with
`kind`, `label`, `usedPercent`, `remainingPercent`, `resetAt` (ISO 8601) and
`resetsInSeconds`. `resetCreditsAvailable` is the number of banked rate-limit resets.
When the quota cannot be read, `ok` is `false`, `error.reason` and
`error.message` say why, and the exit code is 1. `CODEX_BIN` selects the Codex executable (default `codex`).

### All installed quota extensions in one document

`codex-quota --all` collates the quota of every installed Claude, Codex and GLM
quota extension into one JSON document: `providers` holds each extension's
own document keyed by `claude`, `codex` or `glm`, and `summary` gives the
worst `band` and the `tightest` window across them. Extensions that are not
installed are left out, and a provider that fails shows `ok: false` without
affecting the others. The exit code is 0 when at least one provider answered.

Each extension records the location of its `cli.js` in
`~/.config/quota-monitor/` (`$XDG_CONFIG_HOME`, `$QUOTA_MONITOR_DIR` or
`%APPDATA%` where set) when it activates or its CLI runs. Any one installed
extension can therefore produce the combined view.

## MCP server for coding agents

`mcp.js` is a Model Context Protocol server (stdio) with two read-only tools:

- `get_quota` returns one provider's document, the same one the command line prints. `provider` picks `claude`, `codex` or `glm` and defaults to `codex`.
- `get_all_quotas` returns the combined document of `--all`.

The server is off by default. Turn it on with the link at the foot of the status bar tooltip, the **Codex Quota: Toggle MCP Server** command, or the `codexQuota.mcp.enabled` setting. Each provider answers only while its own extension's toggle is on; otherwise its document has `ok: false` and `error.reason` `mcp-disabled`. A change applies from the next tool call, with no agent restart.

While it is on, VS Code 1.101 and later list the server under their MCP servers, running with this extension's own settings and credentials. Other agents start it with `node <folder>/mcp.js`, where `<folder>` is this extension's folder or a source checkout. The installed folder name includes the version, so a source checkout gives a path that survives updates. Outside VS Code the server runs `codex` from `PATH`; set `CODEX_BIN` in the agent config to use another executable.

```sh
# Claude Code
claude mcp add -s user quota -- node <folder>/mcp.js
```

```toml
# Codex: ~/.codex/config.toml
[mcp_servers.quota]
command = "node"
args = ["<folder>/mcp.js"]
```

```jsonc
// Kilo: ~/.config/kilo/kilo.jsonc
"mcp": { "quota": { "type": "local", "command": ["node", "<folder>/mcp.js"], "enabled": true } }
```

Any one server reports all installed providers, so one entry per agent is enough. Give that entry `ZAI_API_KEY_COMMAND` (see the GLM Quota README) so GLM can answer through it too.
