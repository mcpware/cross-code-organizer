---
name: organize
description: Open the Cross-Code Organizer (CCO) dashboard to view and manage memories, skills, MCP servers, and hooks across all scopes.
argument-hint: "[port]"
---

# Organize Claude Code Config

Launch the visual dashboard to see and manage your entire Claude Code setup.

## When to use

- User wants to see what memories, skills, MCP servers, or hooks they have
- User asks "what's configured?", "show my setup", "where is this memory?"
- User wants to move items between scopes or clean up duplicates
- User asks to organize or audit their Claude Code configuration

## How to use

```bash
npx @mcpware/cross-code-organizer
```

This starts a local web dashboard. Open the URL shown in the terminal.

## What the dashboard shows

- All memories, skills, MCP servers, hooks, configs, and plugins
- Shows what loads globally vs per-project (Global and Project scopes)
- Drag-and-drop to move items between scopes
- Delete items you don't need
- Search and filter across all categories
