/**
 * E2E tests for the Settings feature (Phase 1 A1-A3).
 * Tests: scanner emits setting records, /api/settings endpoint,
 * Settings pill appears in UI, items are clickable, detail panel shows tier/group.
 */

import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..');
const NODE_BIN = process.execPath;
let PORT_COUNTER = 15200 + Math.floor(Math.random() * 500);

async function createSettingsEnv() {
  const port = PORT_COUNTER++;
  const tmpDir = await mkdtemp(join(tmpdir(), 'cco-settings-test-'));
  const claudeDir = join(tmpDir, '.claude');
  await mkdir(join(claudeDir, 'memory'), { recursive: true });
  await writeFile(join(claudeDir, 'memory', 'MEMORY.md'), '# Memory Index\n');

  // Global user settings
  await writeFile(join(claudeDir, 'settings.json'), JSON.stringify({
    outputStyle: 'streamlined',
    language: 'en',
    fastMode: false,
    permissions: {
      allow: ['Bash(*)', 'Edit'],
      deny: ['WebSearch'],
    },
    enabledMcpjsonServers: ['my-server'],
  }, null, 2));

  // Global local settings override
  await writeFile(join(claudeDir, 'settings.local.json'), JSON.stringify({
    outputStyle: 'verbose',
    autoMemoryEnabled: true,
  }, null, 2));

  // Project dir + settings
  const projectDir = join(tmpDir, 'myproject');
  await mkdir(join(projectDir, '.claude'), { recursive: true });
  await writeFile(join(projectDir, '.claude', 'settings.json'), JSON.stringify({
    outputStyle: 'markdown',
    plansDirectory: join(projectDir, '.claude', 'plans'),
  }, null, 2));

  // Encode project path for project scope ID
  const encodedProject = projectDir.replace(/\//g, '-');
  const projectClaudeDir = join(claudeDir, 'projects', encodedProject);
  await mkdir(join(projectClaudeDir, 'memory'), { recursive: true });
  await writeFile(join(projectClaudeDir, 'memory', 'MEMORY.md'), '# Memory Index\n');

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

  // Warmup
  for (let i = 0; i < 5; i++) {
    try {
      const r = await (await fetch(`${baseURL}/api/scan`)).json();
      if (r.items?.length > 0) break;
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 300));
  }

  return {
    tmpDir, claudeDir, projectDir, encodedProject, baseURL, server,
    async cleanup() {
      if (!server.killed) server.kill('SIGKILL');
      await new Promise(r => { server.once('exit', r); setTimeout(r, 3000); });
      await new Promise(r => setTimeout(r, 300));
      try { await rm(tmpDir, { recursive: true, force: true }); } catch { /* best effort */ }
    },
  };
}

// ─── API Layer ────────────────────────────────────────────────────────

test.describe('Settings API', () => {
  let env;
  test.beforeAll(async () => { env = await createSettingsEnv(); });
  test.afterAll(async () => { await env.cleanup(); });

  test('/api/scan includes setting category records', async () => {
    const data = await (await fetch(`${env.baseURL}/api/scan`)).json();
    const settings = data.items.filter(i => i.category === 'setting');
    expect(settings.length).toBeGreaterThan(0);
    expect(data.counts.setting).toBeGreaterThan(0);
  });

  test('setting records have required fields', async () => {
    const data = await (await fetch(`${env.baseURL}/api/scan`)).json();
    const s = data.items.find(i => i.category === 'setting');
    expect(s).toBeDefined();
    expect(s.name).toBeTruthy();
    expect(s.sourceTier).toMatch(/^(user|local|project|managed)$/);
    expect(s.sourceFile).toBeTruthy();
    expect(s.settingGroup).toBeTruthy();
    expect(s.valueType).toBeTruthy();
    expect(s.locked).toBe(true);
  });

  test('outputStyle in settings.json → tier=user', async () => {
    const data = await (await fetch(`${env.baseURL}/api/scan`)).json();
    const rec = data.items.find(i => i.category === 'setting' && i.name === 'outputStyle' && i.sourceTier === 'user');
    expect(rec).toBeDefined();
    expect(rec.value).toBe('streamlined');
    expect(rec.settingGroup).toBe('runtime');
  });

  test('outputStyle in settings.local.json → tier=local', async () => {
    const data = await (await fetch(`${env.baseURL}/api/scan`)).json();
    const rec = data.items.find(i => i.category === 'setting' && i.name === 'outputStyle' && i.sourceTier === 'local');
    expect(rec).toBeDefined();
    expect(rec.value).toBe('verbose');
  });

  test('permissions expanded to permissions.allow and permissions.deny', async () => {
    const data = await (await fetch(`${env.baseURL}/api/scan`)).json();
    const allow = data.items.find(i => i.category === 'setting' && i.name === 'permissions.allow');
    const deny  = data.items.find(i => i.category === 'setting' && i.name === 'permissions.deny');
    expect(allow).toBeDefined();
    expect(allow.settingGroup).toBe('permissions');
    expect(allow.valueType).toBe('array');
    expect(deny).toBeDefined();
  });

  test('hooks key is NOT emitted as setting record (handled by scanHooks)', async () => {
    const data = await (await fetch(`${env.baseURL}/api/scan`)).json();
    const hooksRecord = data.items.find(i => i.category === 'setting' && i.name === 'hooks');
    expect(hooksRecord).toBeUndefined();
  });

  test('mcpServers key is NOT emitted as setting record (handled by scanMcpServers)', async () => {
    const data = await (await fetch(`${env.baseURL}/api/scan`)).json();
    const mcpRecord = data.items.find(i => i.category === 'setting' && i.name === 'mcpServers');
    expect(mcpRecord).toBeUndefined();
  });

  test('GET /api/settings?scope=global returns structured response', async () => {
    const data = await (await fetch(`${env.baseURL}/api/settings?scope=global`)).json();
    expect(data.scopeId).toBe('global');
    expect(Array.isArray(data.records)).toBe(true);
    expect(data.records.length).toBeGreaterThan(0);
    expect(Array.isArray(data.sources)).toBe(true);
    expect(data.sources.length).toBeGreaterThan(0);
    expect(typeof data.groups).toBe('object');
    expect(data.groups.runtime).toBeDefined();
  });

  test('GET /api/settings?scope=global filters to global scope only', async () => {
    const data = await (await fetch(`${env.baseURL}/api/settings?scope=global`)).json();
    expect(data.records.every(r => r.scopeId === 'global')).toBe(true);
  });

  test('GET /api/settings without scope returns 400', async () => {
    const res = await fetch(`${env.baseURL}/api/settings`);
    expect(res.status).toBe(400);
  });
});

// ─── UI Layer ────────────────────────────────────────────────────────

test.describe('Settings UI', () => {
  let env;
  test.beforeAll(async () => { env = await createSettingsEnv(); });
  test.afterAll(async () => { await env.cleanup(); });

  test('Settings pill appears in filter bar with non-zero count', async ({ page }) => {
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push(e.message));

    await page.goto(env.baseURL);
    await page.waitForSelector('.f-pill', { timeout: 8000 });

    const settingsPill = page.locator('.f-pill', { hasText: 'Settings' });
    await expect(settingsPill).toBeVisible();

    const countText = await settingsPill.locator('b').textContent();
    expect(parseInt(countText)).toBeGreaterThan(0);

    expect(errors).toHaveLength(0);
  });

  test('Clicking Settings pill filters to setting items only', async ({ page }) => {
    await page.goto(env.baseURL);
    await page.waitForSelector('.f-pill', { timeout: 8000 });

    const settingsPill = page.locator('.f-pill', { hasText: 'Settings' });
    await settingsPill.click();
    await page.waitForTimeout(300);

    const items = page.locator('.item[data-category="setting"]');
    await expect(items.first()).toBeVisible();
    const count = await items.count();
    expect(count).toBeGreaterThan(0);

    // No items from other categories should be visible
    const otherItems = page.locator('.item:not([data-category="setting"])');
    await expect(otherItems).toHaveCount(0);
  });

  test('Setting item shows name, value preview, group, and tier in row', async ({ page }) => {
    await page.goto(env.baseURL);
    await page.waitForSelector('.f-pill', { timeout: 8000 });

    const settingsPill = page.locator('.f-pill', { hasText: 'Settings' });
    await settingsPill.click();
    await page.waitForTimeout(300);

    // Find an outputStyle item (any tier — there may be multiple)
    const outputStyleItems = page.locator('.item[data-category="setting"]', { hasText: 'outputStyle' });
    await expect(outputStyleItems.first()).toBeVisible();

    // Collect all value previews — at least one should be streamlined, verbose, or markdown
    const count = await outputStyleItems.count();
    const descs = [];
    for (let i = 0; i < count; i++) {
      descs.push(await outputStyleItems.nth(i).locator('.item-desc').textContent());
    }
    expect(descs.some(d => /streamlined|verbose|markdown/.test(d))).toBe(true);

    // Should show group and tier on the right (check first item)
    const sizeEl = outputStyleItems.first().locator('.item-size');
    const dateEl = outputStyleItems.first().locator('.item-date');
    await expect(sizeEl).toBeVisible();
    await expect(dateEl).toBeVisible();
    expect(await sizeEl.textContent()).toBe('runtime');
    expect(await dateEl.textContent()).toMatch(/user|local|project|managed/);
  });

  test('Clicking a setting item opens detail panel with tier and group info', async ({ page }) => {
    await page.goto(env.baseURL);
    await page.waitForSelector('.f-pill', { timeout: 8000 });

    const settingsPill = page.locator('.f-pill', { hasText: 'Settings' });
    await settingsPill.click();
    await page.waitForTimeout(300);

    const firstItem = page.locator('.item[data-category="setting"]').first();
    await firstItem.click();
    await page.waitForTimeout(400);

    // Detail panel should be visible
    const detailPanel = page.locator('#detailPanel');
    await expect(detailPanel).toBeVisible();

    // Source and Tier should appear in detail dates section
    const detailInfo = detailPanel.locator('.d-info-cell');
    const labels = await detailInfo.locator('.d-info-label').allTextContents();
    expect(labels).toContain('Source');
    expect(labels).toContain('Tier');

    // Preview shows JSON value
    const preview = detailPanel.locator('#previewContent');
    await expect(preview).toBeVisible();
    const previewText = await preview.textContent();
    expect(previewText.trim().length).toBeGreaterThan(0);
    expect(previewText).not.toBe('Loading...');
  });

  test('Detail panel effective behavior section explains tier precedence', async ({ page }) => {
    await page.goto(env.baseURL);
    await page.waitForSelector('.f-pill', { timeout: 8000 });

    const settingsPill = page.locator('.f-pill', { hasText: 'Settings' });
    await settingsPill.click();
    await page.waitForTimeout(300);

    const firstItem = page.locator('.item[data-category="setting"]').first();
    await firstItem.click();
    await page.waitForTimeout(400);

    const effectiveSection = page.locator('#detailEffective');
    await expect(effectiveSection).not.toHaveClass(/hidden/);
    const text = await effectiveSection.locator('#detailEffectiveText').textContent();
    expect(text).toMatch(/tier|Precedence/i);
  });
});
