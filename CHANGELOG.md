## 0.10.0 - 2026-11-21

- Optional MCP server for coding agents, off by default: `mcp.js` with the tools `get_quota` and `get_all_quotas`. Toggle it from the link at the foot of the status bar tooltip, the **Codex Quota: Toggle MCP Server** command, or `codexQuota.mcp.enabled`. While on, VS Code lists the server under its MCP servers.

## 0.9.3 - 2026-11-21

- Open Usage Page and double-click go to `chatgpt.com/settings/usage`, the page Codex itself links to for usage limits.
- `cli.js` prints the Codex quota as one JSON document for coding agents; `--all` adds every other installed quota extension.

## 0.9.2 - 2026-10-23

- User-owned material now CC BY-NC-SA 4.0; third-party and earlier grants preserved.
- Executable override is machine-scoped; disabled in untrusted workspaces.

