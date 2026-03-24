# Claude Code Organizer

[![npm version](https://img.shields.io/npm/v/@mcpware/claude-code-organizer)](https://www.npmjs.com/package/@mcpware/claude-code-organizer)
[![npm downloads](https://img.shields.io/npm/dt/@mcpware/claude-code-organizer?label=downloads)](https://www.npmjs.com/package/@mcpware/claude-code-organizer)
[![GitHub stars](https://img.shields.io/github/stars/mcpware/claude-code-organizer)](https://github.com/mcpware/claude-code-organizer/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/mcpware/claude-code-organizer)](https://github.com/mcpware/claude-code-organizer/network/members)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

English | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Bahasa Indonesia](README.id.md) | [Italiano](README.it.md) | [Português](README.pt-BR.md) | [Türkçe](README.tr.md) | [Tiếng Việt](README.vi.md) | [ไทย](README.th.md)

**Organize all your Claude Code memories, skills, MCP servers, and hooks — view by scope hierarchy, move between scopes via drag-and-drop.**

![Claude Code Organizer Demo](docs/demo.gif)

![Claude Code Organizer Screenshot](docs/screenshot.png)

## The Problem

Claude Code silently creates memories, skills, and MCP configs every time you work — and dumps them into whatever scope matches your current directory. A preference you wanted everywhere? Trapped in one project. A deploy skill that belongs to one repo? Leaked into global, contaminating every other project.

**This isn't just messy — it hurts your AI's performance.** Every session, Claude loads all configs from the current scope plus everything inherited from parent scopes into your context window. Wrong-scope items = wasted tokens, polluted context, and lower accuracy. A Python pipeline skill sitting in global gets loaded into your React frontend session. Duplicate MCP entries initialize the same server twice. Stale memories contradict your current instructions.

### "Just ask Claude to fix it"

You could ask Claude Code to manage its own config. But you'll go back and forth — `ls` one directory, `cat` each file, try to piece together the full picture from fragments of text output. **There's no command that shows the entire tree** across all scopes, all items, all inheritance at once.

### The fix: a visual dashboard

```bash
npx @mcpware/claude-code-organizer
```

One command. See everything Claude has stored — organized by scope hierarchy. **Drag items between scopes.** Delete stale memories. Find duplicates. Take control of what actually influences Claude's behavior.

### Example: Project → Global

You told Claude "I prefer TypeScript + ESM" while inside a project, but that preference applies everywhere. Open the dashboard, drag that memory from Project to Global. **Done. One drag.**

### Example: Global → Project

A deploy skill sitting in global only makes sense for one repo. Drag it into that Project scope — other projects won't see it anymore.

### Example: Delete stale memories

Claude auto-creates memories from things you said casually, or things it *thought* you wanted remembered. A week later they're irrelevant but still loaded into every session. Browse, read, delete. **You control what Claude thinks it knows about you.**

---

## Features

- **Scope-aware hierarchy** — See all items organized as Global > Workspace > Project, with inheritance indicators
- **Drag-and-drop** — Move memories between scopes, skills between global and per-repo, MCP servers between configs
- **Undo everything** — Every move and delete has an undo button — restore instantly, including MCP JSON entries
- **Bulk operations** — Select mode: tick multiple items, move or delete all at once
- **Same-type safety** — Memories can only move to memory folders, skills to skill folders, MCP to MCP configs
- **Search & filter** — Real-time search across all items, filter by category (Memory, Skills, MCP, Config, Hooks, Plugins, Plans, Sessions)
- **Detail panel** — Click any item to see full metadata, content preview, file path, and open in VS Code
- **Session inspector** — Parsed conversation previews with speaker labels, session titles, and metadata
- **8 categories** — Memories, skills, MCP servers, configs, hooks, plugins, plans, and sessions
- **Bundled skill detection** — Groups skills by source bundle via `skills-lock.json`
- **Contextual Claude Code prompts** — "Explain This", "Edit Content", "Resume Session" buttons that copy to clipboard
- **Resizable panels** — Drag dividers to resize sidebar, content area, and detail panel
- **Real file moves** — Actually moves files in `~/.claude/`, not just a viewer
- **61 E2E tests** — Playwright test suite with real filesystem verification after every operation

## Why a Visual Dashboard?

Claude Code can already list and move files via CLI — but you're stuck playing 20 questions with your own config. The dashboard gives you **full visibility in one glance:**

| What you need | Ask Claude | Visual Dashboard |
|---------------|:-----------:|:----------------:|
| **See everything at once** across all scopes | `ls` one directory at a time, piece it together | Scope tree, one glance |
| **What's loaded in my current project?** | Run multiple commands, hope you got them all | Open project → see full inheritance chain |
| **Move items between scopes** | Find encoded paths, `mv` manually | Drag-and-drop with confirmation |
| **Read config content** | `cat` each file one by one | Click → side panel |
| **Find duplicates / stale items** | `grep` across cryptic directories | Search + filter by category |
| **Clean up unused memories** | Figure out which files to delete | Browse, read, delete in-place |

## Quick Start

### Option 1: npx (no install needed)

```bash
npx @mcpware/claude-code-organizer
```

### Option 2: Global install

```bash
npm install -g @mcpware/claude-code-organizer
claude-code-organizer
```

### Option 3: Ask Claude

Paste this into Claude Code:

> Run `npx @mcpware/claude-code-organizer` — it's a dashboard for managing Claude Code settings. Tell me the URL when it's ready.

Opens a dashboard at `http://localhost:3847`. Works with your real `~/.claude/` directory.

## What It Manages

| Type | View | Move | Delete | Scanned at |
|------|:----:|:----:|:------:|:----------:|
| Memories (feedback, user, project, reference) | Yes | Yes | Yes | Global + Project |
| Skills (with bundle detection) | Yes | Yes | Yes | Global + Project |
| MCP Servers | Yes | Yes | Yes | Global + Project |
| Plans | Yes | Yes | Yes | Global + Project |
| Sessions | Yes | — | Yes | Project only |
| Config (CLAUDE.md, settings.json) | Yes | Locked | — | Global + Project |
| Hooks | Yes | Locked | — | Global + Project |
| Plugins | Yes | Locked | — | Global only |

## Scope Hierarchy

```
Global                       <- applies everywhere
  Company (workspace)        <- applies to all sub-projects
    CompanyRepo1             <- project-specific
    CompanyRepo2             <- project-specific
  SideProjects (project)     <- independent project
  Documents (project)        <- independent project
```

Child scopes inherit parent scope's memories, skills, and MCP servers.

## How It Works

1. **Scans** `~/.claude/` — discovers all projects, memories, skills, MCP servers, hooks, plugins, plans, and sessions
2. **Resolves scope hierarchy** — determines parent-child relationships from filesystem paths
3. **Renders dashboard** — three-panel layout: sidebar scope tree, category-grouped items, detail panel with content preview
4. **Handles moves** — drag or click "Move to...", moves files on disk with safety checks, undo support
5. **Handles deletes** — delete with undo, bulk delete, session cleanup

## Comparison

We analyzed the source code of every Claude Code tool we could find — analytics dashboards (9K+ stars), desktop apps (600+ stars), VS Code extensions, TUI session managers, terminal statuslines. None offered true scope hierarchy + drag-and-drop cross-scope moves in a standalone dashboard.

| Feature | **Claude Code Organizer** | Desktop app (600+⭐) | VS Code extension | Analytics dashboards | TUI tools |
|---------|:---:|:---:|:---:|:---:|:---:|
| True scope hierarchy (Global > Workspace > Project) | **Yes** | No | Partial (no workspace) | No | No |
| Drag-and-drop moves | **Yes** | No | No | No | No |
| Cross-scope moves | **Yes** | No | One-click | No | No |
| Undo on every action | **Yes** | No | No | No | No |
| Bulk operations | **Yes** | No | No | No | No |
| Real MCP server management | **Yes** | Global only | Stub (icon only) | No | No |
| Session management | **Yes** | No | No | Yes | Yes |
| Search & filter | **Yes** | No | Yes | Yes | No |
| MCP tools (AI-accessible) | **Yes** | No | No | No | No |
| Zero dependencies | **Yes** | No (Tauri+React) | No (VS Code) | No (Next.js/FastAPI) | No (Python) |
| Standalone (no IDE) | **Yes** | Yes | No | Yes | Yes |

## Platform Support

| Platform | Status |
|----------|:------:|
| Ubuntu / Linux | Supported |
| macOS (Intel + Apple Silicon) | Supported (community-tested on Sequoia M3) |
| Windows | Not yet |
| WSL | Should work (untested) |

## Project Structure

```
src/
  scanner.mjs       # Scans ~/.claude/ — 8 categories, pure data, no side effects
  mover.mjs         # Moves/deletes files between scopes — safety checks + undo support
  server.mjs        # HTTP server — 8 REST endpoints
  mcp-server.mjs    # MCP server — 4 tools for AI clients (scan, move, delete, destinations)
  ui/
    index.html       # Three-panel layout with resizable dividers
    style.css        # All styling (edit freely, won't break logic)
    app.js           # Frontend: drag-drop, search, filters, bulk ops, undo, session preview
bin/
  cli.mjs            # Entry point (--mcp flag for MCP server mode)
```

Frontend and backend are fully separated. Edit `src/ui/` files to change the look without touching any logic.

## API

The dashboard is backed by a REST API:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/scan` | GET | Scan all customizations, returns scopes + items + counts |
| `/api/move` | POST | Move an item to a different scope (supports category/name disambiguation) |
| `/api/delete` | POST | Delete an item (memory, skill, MCP, plan, session) |
| `/api/restore` | POST | Restore a deleted file (undo support) |
| `/api/restore-mcp` | POST | Restore a deleted MCP server JSON entry (undo support) |
| `/api/destinations` | GET | Get valid move destinations for an item |
| `/api/file-content` | GET | Read file content for detail panel preview |
| `/api/session-preview` | GET | Parse JSONL session into readable conversation with speaker labels |

## License

MIT

## More from @mcpware

| Project | What it does | Install |
|---------|---|---|
| **[Instagram MCP](https://github.com/mcpware/instagram-mcp)** | 23 Instagram Graph API tools — posts, comments, DMs, stories, analytics | `npx @mcpware/instagram-mcp` |
| **[UI Annotator](https://github.com/mcpware/ui-annotator-mcp)** | Hover labels on any web page — AI references elements by name | `npx @mcpware/ui-annotator` |
| **[Pagecast](https://github.com/mcpware/pagecast)** | Record browser sessions as GIF or video via MCP | `npx @mcpware/pagecast` |
| **[LogoLoom](https://github.com/mcpware/logoloom)** | AI logo design → SVG → full brand kit export | `npx @mcpware/logoloom` |
## Author

[ithiria894](https://github.com/ithiria894) — Building tools for the Claude Code ecosystem.
