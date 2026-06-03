# MCP Setup

This project keeps MCP configuration local to the repo and avoids committing secrets.

## Enabled Servers

- `context7`: current developer documentation lookup.
- `playwright`: browser automation for frontend verification.
- `sequential-thinking`: structured decomposition for larger implementation tasks.

## opencode

Project config is in `.opencode/opencode.json`.

Restart opencode after changing the file because config is loaded on startup.

## Codex

Project config is in `.codex/config.toml`.

From this repo, use `/mcp` inside Codex to verify the servers are active.

## Antigravity

Import `mcp/antigravity.mcp.json` in Antigravity's MCP settings, or manually add the same stdio servers:

```json
{
  "context7": ["npx", "-y", "@upstash/context7-mcp"],
  "playwright": ["npx", "-y", "@playwright/mcp"],
  "sequential-thinking": ["npx", "-y", "@modelcontextprotocol/server-sequential-thinking"]
}
```

## Optional Later

Add these only when needed and keep tokens in environment variables:

- GitHub MCP for issues/PR automation.
- Sentry MCP for production error triage.
- Figma MCP for design-to-frontend workflows.
