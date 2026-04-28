#!/usr/bin/env node

/**
 * cli.mjs — Entry point for Cross-Code Organizer (CCO).
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
const distillIdx = args.indexOf('--distill');
const isDistillMode = distillIdx !== -1;

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
        'description: Open Cross-Code Organizer (CCO) dashboard to manage memories, skills, MCP servers across scopes',
        'model: haiku',
        '---',
        '',
        '1. Run `npx @mcpware/cross-code-organizer@latest` in background',
        '2. Wait 3 seconds for the server to start',
        '3. Open the browser: `xdg-open http://localhost:3847` (Linux) or `open http://localhost:3847` (macOS)',
        '4. Always tell the user: **http://localhost:3847**',
        '',
        'The dashboard shows your full scope hierarchy (Global > Workspace > Project) with drag-and-drop between scopes.',
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

    const resp = await fetch('https://registry.npmjs.org/@mcpware/cross-code-organizer/latest', { signal: AbortSignal.timeout(3000) });
    if (!resp.ok) return null;
    const data = await resp.json();
    const latestVersion = data.version;

    if (localVersion !== latestVersion) {
      return { local: localVersion, latest: latestVersion };
    }
  } catch { /* silent — don't block startup */ }
  return null;
}

if (isDistillMode) {
  // CLI distill mode: npx @mcpware/cross-code-organizer --distill <session.jsonl>
  const sessionPath = args[distillIdx + 1];
  if (!sessionPath || !sessionPath.endsWith('.jsonl')) {
    console.error('\n  Usage: npx @mcpware/cross-code-organizer --distill <session.jsonl>\n');
    process.exit(1);
  }
  const { resolve } = await import('node:path');
  const { distillSession } = await import('../src/session-distiller.mjs');
  const fmt = b => b < 1024 ? b + 'B' : b < 1048576 ? (b / 1024).toFixed(1) + 'K' : (b / 1048576).toFixed(1) + 'M';
  try {
    const r = await distillSession(resolve(sessionPath));
    const s = r.stats;
    console.log(`\n  Session Distiller — by @mcpware/cross-code-organizer`);
    console.log(`  ─────────────────────────────────────────────────────`);
    console.log(`  Backup:    ${r.backupPath} (${fmt(s.backupBytes)})`);
    console.log(`  Distilled: ${r.outputPath} (${fmt(s.outputBytes)}, ${s.reduction} reduction)`);
    if (s.indexEntries > 0) {
      console.log(`  Index:     ${s.indexPath} (${s.indexEntries} refs)`);
    }
    console.log(`  Lines:     ${s.inputLines} → ${s.keptLines}\n`);
  } catch (err) {
    console.error(`\n  Error: ${err.message}\n`);
    process.exit(1);
  }
} else if (isMcpMode) {
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
      console.log(`     Run: npx @mcpware/cross-code-organizer@latest`);
      console.log(`     Or:  npm update -g @mcpware/cross-code-organizer\n`);
    }
  });

  if (!args.includes('--no-open') && process.env.CCO_NO_OPEN !== '1') {
    try {
      const openCmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
      execSync(`${openCmd} http://localhost:${port}`, { stdio: 'ignore' });
    } catch {
      // Browser didn't open, user can navigate manually
    }
  }
}
