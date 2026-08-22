import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dshAdapter } from '../../src/harness/adapters/dsh.mjs';
import { validateAdapter } from '../../src/harness/interface.mjs';
import { scanHarness } from '../../src/harness/scanner-framework.mjs';

describe('dsh adapter', () => {
  let home;
  let adapter;

  before(async () => {
    home = await mkdtemp(join(tmpdir(), 'cco-dsh-adapter-'));
    const d = join(home, '.dsh');

    await mkdir(join(d, 'profiles', 'web'), { recursive: true });
    await mkdir(join(d, 'profiles', 'headless'), { recursive: true });
    await mkdir(join(d, 'skills', 'demo-skill'), { recursive: true });
    await mkdir(join(d, 'skills', '.system', 'system-skill'), { recursive: true });

    await writeFile(join(d, 'settings.yaml'), [
      'ui-onboarding:',
      '  welcomeNoticeVersion: 2026-08-13',
      'agent-default-model:',
      '  provider: deepseek-official',
      '  model: deepseek-v4-flash-vision-exp',
    ].join('\n'));

    await writeFile(join(d, 'profiles', 'web', 'cordis.yml'), '# dsh profile root\n[]\n');
    await writeFile(join(d, 'profiles', 'web', 'cordis.patch.yml'), [
      '- insert:',
      '    - id: ponytail',
      "      name: file:///F:/dsh-ponytail/src/index.js",
    ].join('\n'));
    await writeFile(join(d, 'profiles', 'web', 'package.json'), JSON.stringify({
      name: 'dsh-web',
      description: 'DSH web profile',
    }, null, 2));
    await writeFile(join(d, 'profiles', 'headless', 'cordis.yml'), '# dsh profile root\n[]\n');

    await writeFile(join(d, 'skills', 'demo-skill', 'SKILL.md'), '# Demo Skill\n\nUse this for DSH adapter smoke tests.\n');
    await writeFile(join(d, 'skills', '.system', 'system-skill', 'SKILL.md'), '# System Skill\n\nNested system skill layout.\n');

    adapter = validateAdapter(dshAdapter);
  });

  after(async () => {
    await rm(home, { recursive: true, force: true });
  });

  it('validates against the HarnessAdapter contract', () => {
    assert.equal(adapter.id, 'dsh');
    assert.equal(adapter.displayName, 'DeepSeek Harness');
    assert.ok(Array.isArray(adapter.categories));
    assert.ok(Array.isArray(adapter.scopeTypes));
    assert.ok(typeof adapter.getPaths === 'function');
    assert.ok(typeof adapter.discoverScopes === 'function');
    assert.ok(adapter.scanners && typeof adapter.scanners === 'object');
  });

  it('declares supported capabilities as booleans', () => {
    for (const key of ['contextBudget', 'mcpControls', 'mcpPolicy', 'mcpSecurity', 'sessions', 'effective', 'backup']) {
      assert.equal(typeof adapter.capabilities[key], 'boolean', `capabilities.${key} must be boolean`);
    }
  });

  it('scans config, profiles, and skills', async () => {
    const result = await scanHarness(adapter, { home });

    const configNames = result.items.filter((i) => i.category === 'config').map((i) => i.name);
    const profileNames = result.items.filter((i) => i.category === 'profile').map((i) => i.name);
    // skill names may use / or \\ on Windows; assert by suffix (portable).
    const skillNames = result.items.filter((i) => i.category === 'skill').map((i) => i.name);

    assert.ok(configNames.includes('settings.yaml'), 'scans global settings.yaml');
    assert.ok(configNames.includes('web/cordis.yml'), 'scans web cordis.yml');
    assert.ok(configNames.includes('web/cordis.patch.yml'), 'scans web cordis.patch.yml');
    assert.ok(configNames.includes('headless/cordis.yml'), 'scans headless cordis.yml');

    assert.ok(profileNames.includes('web'), 'finds web profile');
    assert.ok(profileNames.includes('headless'), 'finds headless profile');

    assert.ok(skillNames.includes('demo-skill'), 'finds demo skill');
    assert.ok(skillNames.some((n) => n.includes('.system') && n.includes('system-skill')), 'finds nested system skill');
  });

  it('reports reasonable counts', async () => {
    const result = await scanHarness(adapter, { home });
    assert.equal(result.counts.total, 8, 'settings + 3 cordis + 2 profiles + 2 skills');
    assert.equal(result.counts.config, 4);
    assert.equal(result.counts.profile, 2);
    assert.equal(result.counts.skill, 2);
  });
});
