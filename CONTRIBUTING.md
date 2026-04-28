# Contributing to Cross-Code Organizer (CCO)

Thanks for your interest in contributing! This project is maintained by [@ithiria894](https://github.com/ithiria894).

## Quick Start

```bash
# Fork and clone
git clone https://github.com/YOUR_USERNAME/cross-code-organizer.git
cd cross-code-organizer

# Install dependencies
npm install

# Start the dashboard (dev mode)
npm start

# Run tests
npm test

# Run tests with visible browser
npm run test:headed
```

## Project Structure

```
bin/cli.mjs          # Entry point (dashboard or MCP server mode)
src/
  scanner.mjs        # Scans ~/.claude/ for all 11 categories
  mover.mjs          # Moves/deletes files between scopes (with undo)
  server.mjs         # HTTP server (8 REST endpoints)
  mcp-server.mjs     # MCP server wrapper (4 tools)
  history.mjs        # Undo/restore mechanism
  ui/
    app.js           # Frontend: drag-drop, search, filters, bulk ops
    index.html       # Three-panel layout
    style.css        # All styling
tests/
  e2e/               # Playwright E2E tests
```

## How It Works

1. **Scanner** reads `~/.claude/` across two scopes (Global and Project)
2. **Server** exposes scan results via REST API
3. **UI** renders a three-panel dashboard with drag-and-drop
4. **Mover** handles file operations between scopes with full undo support

### Scope Model

Claude Code has two active scopes:

- **Global** — `~/.claude/` — applies to every session on this machine
- **Project** — `<repo>/.claude/` — applies only to that repository

All project scopes inherit directly from Global. There is no intermediate scope between them — sibling projects do not inherit from each other, and nested directory structures do not create additional inheritance layers. The sidebar tree groups projects visually by path, but this is organisational only and does not affect what Claude Code loads.

## What to Work On

- Check [open issues](https://github.com/mcpware/cross-code-organizer/issues) for bugs and feature requests
- Issues labeled `good first issue` are great starting points
- If you want to work on something not listed, open an issue first to discuss

## Pull Request Process

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Run tests: `npm test`
4. Commit with clear messages (e.g., `fix: handle empty memory files`, `feat: add bulk export`)
5. Open a PR against `main`

## Code Style

- Pure ES modules (`.mjs` files)
- Zero runtime npm dependencies (only `@modelcontextprotocol/sdk`)
- No build step — source files run directly
- Keep it simple — no abstractions for one-time operations

## Testing

We use Playwright for E2E tests. Tests spin up the real server and test through the browser.

```bash
# Run all tests
npm test

# Run specific test file
npx playwright test tests/e2e/scanner.test.mjs

# Debug with headed browser
npm run test:headed
```

## Reporting Issues

- Use [GitHub Issues](https://github.com/mcpware/cross-code-organizer/issues)
- Include your OS, Node.js version, and Claude Code version
- For bugs, include steps to reproduce

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
