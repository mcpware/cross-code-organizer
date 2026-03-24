#!/usr/bin/env node

/**
 * cli.mjs — Entry point for Claude Code Organizer.
 * Usage:
 *   node bin/cli.mjs              → Start web dashboard (HTTP server)
 *   node bin/cli.mjs --mcp        → Start MCP server (stdio, for AI clients)
 *   node bin/cli.mjs --port 3847  → Start web dashboard on custom port
 */

import { access, constants } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ── Pre-flight check: verify ~/.claude/ exists and is readable ──
const claudeDir = join(homedir(), '.claude');
try {
  await access(claudeDir, constants.R_OK);
} catch {
  console.error(`\n  ✗ Cannot read ${claudeDir}\n`);
  console.error(`  Claude Code stores its config in ~/.claude/ but this directory`);
  console.error(`  either doesn't exist or isn't readable by your current user.\n`);
  console.error(`  To fix:`);
  console.error(`    1. Make sure Claude Code has been run at least once`);
  console.error(`    2. Check permissions: ls -la ~/.claude/`);
  console.error(`    3. If needed:  chmod u+r ~/.claude\n`);
  process.exit(1);
}

const args = process.argv.slice(2);

if (args.includes('--mcp')) {
  // MCP server mode — AI clients connect via stdio
  await import('../src/mcp-server.mjs');
} else {
  // Web dashboard mode — human opens browser
  const { startServer } = await import('../src/server.mjs');
  const { execSync } = await import('node:child_process');

  const portIdx = args.indexOf('--port');
  const port = portIdx !== -1 ? parseInt(args[portIdx + 1], 10) : 3847;

  startServer(port);

  try {
    const openCmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
    execSync(`${openCmd} http://localhost:${port}`, { stdio: 'ignore' });
  } catch {
    // Browser didn't open, user can navigate manually
  }
}
