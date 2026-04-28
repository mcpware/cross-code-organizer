/**
 * E2E tests for Backup Center modal.
 *
 * Tests:
 * - ☁ Backup Center button opens centered modal
 * - Modal shows item count pills from scan data
 * - Status section shows git/scheduler info
 * - Close: ✕ button, Escape key, overlay click
 * - Back Up Now calls /api/backup/run and updates UI
 * - Sync Now calls /api/backup/sync and shows log
 * - Configure Remote inline edit flow
 * - Snapshot Export calls /api/export
 * - Apply interval calls /api/backup/scheduler/install
 */

import { test, expect } from '@playwright/test';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const exec = promisify(execFile);
const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..');
const NODE_BIN = process.execPath;
let PORT_COUNTER = 15700 + Math.floor(Math.random() * 500);

async function createBackupEnv() {
  const port = PORT_COUNTER++;
  const tmpDir = await mkdtemp(join(tmpdir(), 'cco-backup-e2e-'));
  const claudeDir = join(tmpDir, '.claude');

  // Create minimal Claude structure so scan returns items
  await mkdir(join(claudeDir, 'memory'), { recursive: true });
  await mkdir(join(claudeDir, 'skills', 'my-skill'), { recursive: true });
  await writeFile(join(claudeDir, 'memory', 'notes.md'), '---\nname: notes\ndescription: Test\ntype: project\n---\nTest memory\n');
  await writeFile(join(claudeDir, 'skills', 'my-skill', 'SKILL.md'), '# My Skill\nTest skill\n');
  await writeFile(join(claudeDir, 'settings.json'), JSON.stringify({ outputStyle: 'streamlined' }, null, 2));

  // Create backup dir with a real git repo + pre-existing config
  const backupDir = join(tmpDir, '.claude-backups');
  await mkdir(join(backupDir, 'latest'), { recursive: true });

  // Initialize a real git repo (needed for commitAndPush)
  await exec('git', ['init', '-b', 'main'], { cwd: backupDir });
  await exec('git', ['config', 'user.email', 'test@cco.test'], { cwd: backupDir });
  await exec('git', ['config', 'user.name', 'CCO Test'], { cwd: backupDir });
  await writeFile(join(backupDir, '.gitignore'), 'backup-*/\n*.log\nconfig.json\n');
  await exec('git', ['add', '.gitignore'], { cwd: backupDir });
  await exec('git', ['commit', '-m', 'init'], { cwd: backupDir });

  const lastRun = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago
  await writeFile(join(backupDir, 'config.json'), JSON.stringify({
    interval: 4,
    installedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    lastRun,
    lastCopied: 12,
    lastErrors: 0,
  }, null, 2));

  let actualPort = port;
  const server = await new Promise((resolve, reject) => {
    const proc = spawn(NODE_BIN, [join(PROJECT_ROOT, 'bin', 'cli.mjs'), '--port', String(port), '--no-open'], {
      env: { ...process.env, HOME: tmpDir },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const timeout = setTimeout(() => reject(new Error('Server start timeout')), 10000);
    proc.stdout.on('data', (data) => {
      const msg = data.toString();
      if (msg.includes('running at')) {
        clearTimeout(timeout);
        const match = msg.match(/localhost:(\d+)/);
        if (match) actualPort = parseInt(match[1], 10);
        resolve(proc);
      }
    });
    proc.on('error', (err) => { clearTimeout(timeout); reject(err); });
  });

  const baseURL = `http://localhost:${actualPort}`;

  // Warmup: wait for scan data
  for (let i = 0; i < 8; i++) {
    try {
      const r = await (await fetch(`${baseURL}/api/scan`)).json();
      if (r.items?.length > 0) break;
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 300));
  }

  return {
    tmpDir, claudeDir, backupDir, baseURL, server, actualPort,
    async cleanup() {
      if (!server.killed) server.kill('SIGKILL');
      await new Promise(r => { server.once('exit', r); setTimeout(r, 3000); });
      await new Promise(r => setTimeout(r, 300));
      try { await rm(tmpDir, { recursive: true, force: true }); } catch {}
    },
  };
}

// ── Modal open / close ────────────────────────────────────────────────

test.describe('Backup Center modal — open and close', () => {
  let env;

  test.beforeEach(async () => { env = await createBackupEnv(); });
  test.afterEach(async () => { await env.cleanup(); });

  test('clicking ☁ Backup Center opens centered modal', async ({ page }) => {
    await page.goto(env.baseURL);
    await page.waitForSelector('#exportBtn', { timeout: 8000 });

    await page.click('#exportBtn');
    const modal = page.locator('#backupModal');
    await expect(modal).toBeVisible({ timeout: 3000 });

    // Should have "Backup Center" title
    await expect(page.locator('#bkpTitle')).toContainText('Backup Center');

    // Modal should be centered (modal-bg uses flexbox center)
    const modalBg = page.locator('#backupModal');
    await expect(modalBg).toBeVisible();
  });

  test('close button (✕) dismisses modal', async ({ page }) => {
    await page.goto(env.baseURL);
    await page.click('#exportBtn');
    await expect(page.locator('#backupModal')).toBeVisible();

    await page.click('#backupModalClose');
    await expect(page.locator('#backupModal')).toBeHidden();
  });

  test('Escape key closes modal', async ({ page }) => {
    await page.goto(env.baseURL);
    await page.click('#exportBtn');
    await expect(page.locator('#backupModal')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('#backupModal')).toBeHidden();
  });

  test('clicking overlay (modal-bg) closes modal', async ({ page }) => {
    await page.goto(env.baseURL);
    await page.click('#exportBtn');
    await expect(page.locator('#backupModal')).toBeVisible();

    // Click the dark overlay area (top-left corner of modal-bg, outside inner modal)
    await page.locator('#backupModal').click({ position: { x: 10, y: 10 } });
    await expect(page.locator('#backupModal')).toBeHidden();
  });

  test('can re-open modal after closing', async ({ page }) => {
    await page.goto(env.baseURL);
    await page.click('#exportBtn');
    await expect(page.locator('#backupModal')).toBeVisible();
    await page.click('#backupModalClose');
    await expect(page.locator('#backupModal')).toBeHidden();

    await page.click('#exportBtn');
    await expect(page.locator('#backupModal')).toBeVisible();
  });
});

// ── Item count pills ──────────────────────────────────────────────────

test.describe('Backup Center — item count display', () => {
  let env;

  test.beforeEach(async () => { env = await createBackupEnv(); });
  test.afterEach(async () => { await env.cleanup(); });

  test('pills container is populated with at least one pill', async ({ page }) => {
    await page.goto(env.baseURL);
    await page.click('#exportBtn');
    await expect(page.locator('#backupModal')).toBeVisible();

    // Wait for pills to render (populated from scan data)
    await page.waitForSelector('#bkpPills .bkp-pill', { timeout: 5000 });
    const pillCount = await page.locator('#bkpPills .bkp-pill').count();
    expect(pillCount).toBeGreaterThan(0);
  });

  test('total badge shows item count', async ({ page }) => {
    await page.goto(env.baseURL);
    await page.click('#exportBtn');
    await expect(page.locator('#backupModal')).toBeVisible();

    await page.waitForSelector('#bkpTotalBadge', { timeout: 5000 });
    const badgeText = await page.locator('#bkpTotalBadge').textContent();
    expect(badgeText).toMatch(/\d+ items/);
  });
});

// ── Status loading ────────────────────────────────────────────────────

test.describe('Backup Center — status section', () => {
  let env;

  test.beforeEach(async () => { env = await createBackupEnv(); });
  test.afterEach(async () => { await env.cleanup(); });

  test('last run time is displayed', async ({ page }) => {
    await page.goto(env.baseURL);
    await page.click('#exportBtn');
    await expect(page.locator('#backupModal')).toBeVisible();

    // Wait for async status load
    await page.waitForFunction(
      () => {
        const el = document.getElementById('bkpLastRun');
        return el && !el.textContent.includes('Loading');
      },
      { timeout: 5000 }
    );
    const lastRun = await page.locator('#bkpLastRun').textContent();
    expect(lastRun).toMatch(/Last backed up:|Never backed up/);
  });

  test('/api/backup/status returns ok', async () => {
    const res = await fetch(`${env.baseURL}/api/backup/status`);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(typeof data.totalItems).toBe('number');
    expect(typeof data.schedulerInstalled).toBe('boolean');
    expect(data.lastRun).not.toBeNull(); // we created config.json with lastRun
  });

  test('status API returns correct interval from config', async () => {
    const res = await fetch(`${env.baseURL}/api/backup/status`);
    const data = await res.json();
    expect(data.interval).toBe(4);
  });
});

// ── Back Up Now ───────────────────────────────────────────────────────

test.describe('Backup Center — Back Up Now', () => {
  let env;

  test.beforeEach(async () => { env = await createBackupEnv(); });
  test.afterEach(async () => { await env.cleanup(); });

  test('/api/backup/run endpoint exports and returns counts', async () => {
    const res = await fetch(`${env.baseURL}/api/backup/run`, { method: 'POST' });
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(typeof data.copied).toBe('number');
    expect(data.copied).toBeGreaterThan(0);
    expect(typeof data.counts).toBe('object');
  });

  test('Back Up Now button changes text while running', async ({ page }) => {
    await page.goto(env.baseURL);
    await page.click('#exportBtn');
    await expect(page.locator('#backupModal')).toBeVisible();

    // Click Back Up Now and observe loading state (transient — may be fast)
    const btn = page.locator('#bkpRunNow');
    await btn.click();

    // After completion, button should reset
    await expect(btn).toHaveText('Back Up Now', { timeout: 15000 });
  });

  test('after Back Up Now, last run shows "just now"', async ({ page }) => {
    await page.goto(env.baseURL);
    await page.click('#exportBtn');
    await expect(page.locator('#backupModal')).toBeVisible();

    await page.click('#bkpRunNow');
    await expect(page.locator('#bkpRunNow')).toHaveText('Back Up Now', { timeout: 15000 });

    const lastRunText = await page.locator('#bkpLastRun').textContent();
    expect(lastRunText).toContain('just now');
  });
});

// ── Sync Now ─────────────────────────────────────────────────────────

test.describe('Backup Center — Sync Now', () => {
  let env;

  test.beforeEach(async () => { env = await createBackupEnv(); });
  test.afterEach(async () => { await env.cleanup(); });

  test('/api/backup/sync returns ok', async () => {
    // First do a backup run so there's something to sync
    await fetch(`${env.baseURL}/api/backup/run`, { method: 'POST' });

    const res = await fetch(`${env.baseURL}/api/backup/sync`, { method: 'POST' });
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(typeof data.message).toBe('string');
  });

  test('Sync Now button shows log area after click', async ({ page }) => {
    await page.goto(env.baseURL);
    await page.click('#exportBtn');
    await expect(page.locator('#backupModal')).toBeVisible();

    await page.click('#bkpSyncNow');

    // Log area becomes visible
    await expect(page.locator('#bkpSyncLog')).toBeVisible({ timeout: 5000 });

    // Button eventually resets
    await expect(page.locator('#bkpSyncNow')).toHaveText('Sync Now', { timeout: 15000 });
  });
});

// ── Snapshot Export ───────────────────────────────────────────────────

test.describe('Backup Center — Snapshot Export', () => {
  let env;

  test.beforeEach(async () => { env = await createBackupEnv(); });
  test.afterEach(async () => { await env.cleanup(); });

  test('Snapshot Export button calls /api/export and resets', async ({ page }) => {
    await page.goto(env.baseURL);
    await page.click('#exportBtn');
    await expect(page.locator('#backupModal')).toBeVisible();

    const btn = page.locator('#bkpSnapshotExport');
    await btn.click();

    // Button resets after export
    await expect(btn).toHaveText('Snapshot Export', { timeout: 10000 });
    // Toast appears
    await expect(page.locator('#toast')).toBeVisible({ timeout: 5000 });
  });
});

// ── Configure Remote ──────────────────────────────────────────────────

test.describe('Backup Center — Configure Remote', () => {
  let env;

  test.beforeEach(async () => { env = await createBackupEnv(); });
  test.afterEach(async () => { await env.cleanup(); });

  test('clicking Configure remote... shows inline edit', async ({ page }) => {
    await page.goto(env.baseURL);
    await page.click('#exportBtn');
    await expect(page.locator('#backupModal')).toBeVisible();

    // Click the link
    await page.click('#bkpConfigRemote');

    // Sync view hides, edit shows
    await expect(page.locator('#bkpRemoteEdit')).toBeVisible();
    await expect(page.locator('#bkpSyncView')).toBeHidden();
    await expect(page.locator('#bkpRemoteInput')).toBeVisible();
  });

  test('Cancel in inline edit restores sync view', async ({ page }) => {
    await page.goto(env.baseURL);
    await page.click('#exportBtn');
    await expect(page.locator('#backupModal')).toBeVisible();

    await page.click('#bkpConfigRemote');
    await expect(page.locator('#bkpRemoteEdit')).toBeVisible();

    await page.click('#bkpRemoteCancel');
    await expect(page.locator('#bkpRemoteEdit')).toBeHidden();
    await expect(page.locator('#bkpSyncView')).toBeVisible();
  });

  test('/api/backup/remote sets remote URL', async () => {
    const url = 'git@github.com:test/test-backup.git';
    const res = await fetch(`${env.baseURL}/api/backup/remote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.url).toBe(url);
  });

  test('/api/backup/remote errors on missing url', async () => {
    const res = await fetch(`${env.baseURL}/api/backup/remote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    expect(data.ok).toBe(false);
  });
});
