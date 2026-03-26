# Claude Code Organizer

[![npm version](https://img.shields.io/npm/v/@mcpware/claude-code-organizer)](https://www.npmjs.com/package/@mcpware/claude-code-organizer)
[![npm downloads](https://img.shields.io/npm/dt/@mcpware/claude-code-organizer?label=downloads)](https://www.npmjs.com/package/@mcpware/claude-code-organizer)
[![GitHub stars](https://img.shields.io/github/stars/mcpware/claude-code-organizer)](https://github.com/mcpware/claude-code-organizer/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/mcpware/claude-code-organizer)](https://github.com/mcpware/claude-code-organizer/network/members)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
English | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [廣東話](README.zh-HK.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Bahasa Indonesia](README.id.md) | [Italiano](README.it.md) | [Português](README.pt-BR.md) | [Türkçe](README.tr.md) | [Tiếng Việt](README.vi.md) | [ไทย](README.th.md)

**Pre-session context governance for Claude Code. See what's loaded before you start, find duplicates across scopes, and clean up the config mess — before it eats your context window.**

> **100+ stars in 5 days!** This project had [11 stars when I first posted it on Reddit 3 days ago](https://www.reddit.com/r/coolgithubprojects/comments/1s12n97/claude_code_organizer_dashboard_that_shows/). Real users tested it, gave feedback, and helped shape what it is today. First open source project — thank you to everyone who starred, tested, and reported issues. This is just the beginning.

![Claude Code Organizer Demo](docs/demo.gif)

<sub>Demo video recorded by AI automatically using [Pagecast](https://github.com/mcpware/pagecast)</sub>

## The Problem

Two things happen silently every time you use Claude Code — and neither one is visible to you.

### Problem 1: You have no idea how much context is already used

This is a real project directory after two weeks of use:

![Context Budget](docs/CB.png)

**If you start a Claude Code session under this directory, 69.2K tokens are already loaded before you start any conversation.** That's 34.6% of your 200K context window — gone before you type a single character. Estimated cost just for this overhead: $1.04 USD per session on Opus, $0.21 on Sonnet.

The remaining 65.4% is shared between your messages, Claude's responses, and tool results before context compression kicks in. The fuller the context, the less accurate Claude becomes — an effect known as **context rot**.

Where does 69.2K come from? It includes everything we can **measure offline** — your CLAUDE.md, memories, skills, MCP server definitions, settings, hooks, rules, commands, and agents — tokenized per-item. Plus an **estimated system overhead** (~21K tokens) for the immutable scaffold Claude Code loads on every API call: the system prompt, 23+ built-in tool definitions, and MCP tool schemas.

And that's just what we can count. It does **not** include **runtime injections** — tokens Claude Code silently adds during a session:

- **Rule re-injection** — all your rule files are re-injected into context after every tool call. After ~30 tool calls, this alone can consume ~46% of your context window
- **File change diffs** — when a file you've read or written are modified externally (e.g. by a linter), the full diff is injected as a hidden system-reminder
- **System reminders** — malware warnings, token nudges, and other hidden injections appended to messages
- **Conversation history** — your messages, Claude's responses, and all tool results are resent on every API call

So before you even start typing, the real usage is already well above 69.2K. You just can't see it.

### Problem 2: Your context is contaminated

Claude Code silently creates memories, skills, MCP configs, commands, agents, and rules every time you work — and dumps them into whatever scope matches your current directory. A preference you wanted everywhere? Trapped in one project. A deploy skill that belongs to one repo? Leaked into global, contaminating every other project.

It also silently re-installs MCP servers when you configure them in different scopes. You don't notice until you look:

![Duplicate MCP Servers](docs/reloaded%20mcp%20form%20diff%20scope.png)

Teams installed twice, Gmail three times, Playwright three times — each copy wasting tokens every session. The scope labels (`Global` / `nicole`) show exactly where each duplicate lives, so you can decide which to keep and which to remove.

The same happens with memories. Claude creates duplicates without asking — three separate memories about Slack updates, all saying essentially the same thing, each one loaded into every session.

A Python pipeline skill sitting in global gets loaded into your React frontend session. Stale memories from two weeks ago contradict your current instructions. Every wrong-scope item wastes tokens **and** degrades accuracy.

Claude Code has `/context` to show your token usage inside a session — but by then you're already burning tokens, and it's read-only. There's no way to manage the mess from outside.

### The fix: pre-session context governance

```bash
npx @mcpware/claude-code-organizer
```

One command. **Before you start a session**, see exactly what will be loaded, where each item comes from (which scope), and how much it costs. Preview any item's content. Drag items between scopes. Delete duplicates and stale configs. `/context` tells you "you're using 42% right now" — this tells you "here's exactly why, and here's how to fix it before you start."

> **First run auto-installs a `/cco` skill** — after that, just type `/cco` in any Claude Code session to open the dashboard.

### Example: Find what's eating your tokens

Open the dashboard, click **Context Budget**, switch to **By Tokens** — the biggest consumers are at the top. A 2.4K token CLAUDE.md you forgot about? A skill duplicated across three scopes? Now you see it. Clean it up, save 10-20% of your context window.

### Example: Fix scope contamination

You told Claude "I prefer TypeScript + ESM" while inside a project, but that preference applies everywhere. Drag that memory from Project to Global. **Done. One drag.** A deploy skill sitting in global only makes sense for one repo? Drag it into that Project scope — other projects won't see it anymore.

### Example: Delete stale and duplicate items

Claude auto-creates memories, skills, and MCP server configs from things you said or did. Some become outdated, others get duplicated across scopes — yet all of them still load into every session, wasting tokens. Browse, read, delete. **You decide what Claude loads — not Claude.**

---

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
| Context budget (token breakdown) | **Yes** | No | No | No | No |
| Commands + Agents + Rules | **Yes** | No | No | No | No |
| Session management | **Yes** | No | No | Yes | Yes |
| Search & filter | **Yes** | No | Yes | Yes | No |
| MCP tools (AI-accessible) | **Yes** | No | No | No | No |
| Zero dependencies | **Yes** | No (Tauri+React) | No (VS Code) | No (Next.js/FastAPI) | No (Python) |
| Standalone (no IDE) | **Yes** | Yes | No | Yes | Yes |

## Features

- **Scope-aware hierarchy** — See all items organized as Global > Workspace > Project, with inheritance indicators
- **Drag-and-drop** — Move memories, skills, commands, agents, rules, MCP servers, and plans between scopes
- **Undo everything** — Every move and delete has an undo button — restore instantly, including MCP JSON entries
- **Bulk operations** — Select mode: tick multiple items, move or delete all at once
- **Same-type safety** — Each category moves to its own directory — memories to memory/, skills to skills/, commands to commands/, etc.
- **Search & filter** — Real-time search across all items, filter by category with smart pill hiding (zero-count pills collapse into "+N more")
- **Context Budget** — See exactly how many tokens your config consumes before you type anything — per-item breakdown, inherited scope costs, system overhead estimate, and % of 200K context used
- **Detail panel** — Click any item to see full metadata, content preview, file path, and open in VS Code
- **Session inspector** — Parsed conversation previews with speaker labels, session titles, and metadata
- **11 categories** — Memories, skills, MCP servers, commands, agents, rules, configs, hooks, plugins, plans, and sessions
- **Bundled skill detection** — Groups skills by source bundle via `skills-lock.json`
- **Contextual Claude Code prompts** — "Explain This", "Edit Content", "Edit Command", "Edit Agent", "Resume Session" buttons that copy to clipboard
- **Auto-hide detail panel** — Panel stays hidden until you click an item, maximizing content area
- **Resizable panels** — Drag dividers to resize sidebar, content area, and detail panel
- **Real file moves** — Actually moves files in `~/.claude/`, not just a viewer
- **Path traversal protection** — All file endpoints validate paths are within HOME directory
- **Cross-device support** — Automatic copy+delete fallback when rename fails across filesystems (Docker/WSL)
- **100+ E2E tests** — Playwright test suite covering filesystem verification, security (path traversal, malformed input), context budget, and all 11 categories


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

> Run `npx @mcpware/claude-code-organizer` — it's a dashboard for managing all Claude Code resources. Tell me the URL when it's ready.

Opens a dashboard at `http://localhost:3847` that works directly with your real `~/.claude/` directory. Next time, just type `/cco` in Claude Code to reopen.

## What It Manages

| Type | View | Move | Delete | Scanned at |
|------|:----:|:----:|:------:|:----------:|
| Memories (feedback, user, project, reference) | Yes | Yes | Yes | Global + Project |
| Skills (with bundle detection) | Yes | Yes | Yes | Global + Project |
| MCP Servers | Yes | Yes | Yes | Global + Project |
| Commands (slash commands) | Yes | Yes | Yes | Global + Project |
| Agents (subagents) | Yes | Yes | Yes | Global + Project |
| Rules (project constraints) | Yes | Yes | Yes | Global + Project |
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

Child scopes inherit parent scope's memories, skills, MCP servers, commands, agents, and rules.

## How It Works

1. **Scans** `~/.claude/` — discovers all projects, memories, skills, MCP servers, commands, agents, rules, hooks, plugins, plans, and sessions
2. **Resolves scope hierarchy** — determines parent-child relationships from filesystem paths
3. **Renders dashboard** — three-panel layout: sidebar scope tree, category-grouped items, detail panel with content preview
4. **Handles moves** — drag or click "Move to...", moves files on disk with safety checks, undo support
5. **Handles deletes** — delete with undo, bulk delete, session cleanup

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
  scanner.mjs       # Scans ~/.claude/ — 11 categories, pure data, no side effects
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
| `/api/delete` | POST | Delete an item (memory, skill, MCP, command, agent, rule, plan, session) |
| `/api/restore` | POST | Restore a deleted file (undo support) |
| `/api/restore-mcp` | POST | Restore a deleted MCP server JSON entry (undo support) |
| `/api/destinations` | GET | Get valid move destinations for an item |
| `/api/file-content` | GET | Read file content for detail panel preview |
| `/api/session-preview` | GET | Parse JSONL session into readable conversation with speaker labels |

## Roadmap

| Feature | Status | Description |
|---------|:------:|-------------|
| **Config Export/Backup** | 🔜 Next | One-click export all scanned files to a backup folder — your own snapshot |
| **Skill Quality Scoring** | 📋 Planned | Rate and surface the best skills from 5,000+ in the ecosystem — no more guessing |
| **Security Audit** | 📋 Planned | Scan your `.claude/` for risky permissions, leaked secrets, or suspicious hooks |
| **Cross-Harness Portability** | 📋 Planned | Convert skills/configs between Claude Code ↔ Cursor ↔ Codex ↔ Gemini CLI |
| **Cost Tracker** | 💡 Exploring | Track token usage and cost per session, per project |
| **Diff View** | 💡 Exploring | Compare configs between scopes or between snapshots |

Have a feature idea? [Open an issue](https://github.com/mcpware/claude-code-organizer/issues).

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

[![claude-code-organizer MCP server](https://glama.ai/mcp/servers/mcpware/claude-code-organizer/badges/card.svg)](https://glama.ai/mcp/servers/mcpware/claude-code-organizer)
