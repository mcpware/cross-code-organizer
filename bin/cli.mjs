#!/usr/bin/env node

/**
 * cli.mjs — Entry point for Claude Code Organizer.
 * Usage:
 *   node bin/cli.mjs              → Start web dashboard (HTTP server)
 *   node bin/cli.mjs --mcp        → Start MCP server (stdio, for AI clients)
 *   node bin/cli.mjs --port 3847  → Start web dashboard on custom port
 */

import { access, constants, mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const args = process.argv.slice(2);
const isMcpMode = args.includes('--mcp');

// ── Pre-flight check: verify ~/.claude/ exists and is readable ──
// Skip for MCP mode — server returns empty results if ~/.claude/ missing
if (!isMcpMode) {
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
}

// ── Auto-install /cco skill if not present ──
if (!isMcpMode) {
  const skillDir = join(homedir(), '.claude', 'skills', 'cco');
  const skillFile = join(skillDir, 'SKILL.md');
  try {
    await access(skillFile, constants.R_OK);
  } catch {
    // Skill doesn't exist yet — install it
    try {
      await mkdir(skillDir, { recursive: true });
      await writeFile(skillFile, [
        '---',
        'name: cco',
        'description: Open Claude Code Organizer dashboard to manage memories, skills, MCP servers across scopes',
        '---',
        '',
        'Run `npx @mcpware/claude-code-organizer` to open the config management dashboard at localhost:3847.',
        'The dashboard shows which configs load everywhere versus only in a project, with drag-and-drop between scopes.',
        ''
      ].join('\n'));
      console.log('  ✓ Installed /cco skill globally — next time just type /cco in Claude Code!\n');
    } catch {
      // Non-critical — skip silently if we can't write
    }
  }
}

// ── Update check (non-blocking) ──
async function checkForUpdate() {
  try {
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    const pkg = require('../package.json');
    const localVersion = pkg.version;

    const resp = await fetch('https://registry.npmjs.org/@mcpware/claude-code-organizer/latest', { signal: AbortSignal.timeout(3000) });
    if (!resp.ok) return null;
    const data = await resp.json();
    const latestVersion = data.version;

    if (localVersion !== latestVersion) {
      return { local: localVersion, latest: latestVersion };
    }
  } catch { /* silent — don't block startup */ }
  return null;
}

if (isMcpMode) {
  // MCP server mode — AI clients connect via stdio
  await import('../src/mcp-server.mjs');
} else {
  // Web dashboard mode — human opens browser
  const { startServer } = await import('../src/server.mjs');
  const { execSync } = await import('node:child_process');

  const portIdx = args.indexOf('--port');
  const port = portIdx !== -1 ? parseInt(args[portIdx + 1], 10) : 3847;

  // Check for update in background (don't block server start)
  const updatePromise = checkForUpdate();

  startServer(port);

  // Show update notice after server starts (CLI users)
  updatePromise.then(update => {
    if (update) {
      console.log(`\n  📦 New version available! You're not on the latest.`);
      console.log(`     Run: npx @mcpware/claude-code-organizer@latest`);
      console.log(`     Or:  npm update -g @mcpware/claude-code-organizer\n`);
    }
  });

  try {
    const openCmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
    execSync(`${openCmd} http://localhost:${port}`, { stdio: 'ignore' });
  } catch {
    // Browser didn't open, user can navigate manually
  }
}
