import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getAdapter } from '../../src/harness/registry.mjs';
import { scanHarness } from '../../src/harness/scanner-framework.mjs';
import { codexAdapter } from '../../src/harness/adapters/codex.mjs';

async function createCodexHome() {
  const home = await mkdtemp(join(tmpdir(), 'cco-codex-adapter-'));
  const codexDir = join(home, '.codex');

  await mkdir(join(codexDir, 'memories'), { recursive: true });
  await mkdir(join(codexDir, 'skills', 'demo-skill'), { recursive: true });
  await mkdir(join(codexDir, 'skills', '.system', 'system-skill'), { recursive: true });
  await mkdir(join(codexDir, 'rules'), { recursive: true });
  await mkdir(join(codexDir, 'plugins', 'cache', 'openai-curated', 'github', 'abc123', '.codex-plugin'), { recursive: true });

  await writeFile(join(codexDir, 'config.toml'), `
model = "gpt-5.5"
approval_policy = "never"
sandbox_mode = "danger-full-access"

[profiles.review]
sandbox_mode = "read-only"
approval_policy = "never"

[mcp_servers.context7]
command = "npx"
args = ["-y", "@upstash/context7-mcp"]

[mcp_servers.remote]
url = "https://example.com/mcp"
`);

  await writeFile(join(codexDir, 'memories', 'project.md'), `---
name: Project Memory
description: Important project context
type: project
---
# Project Memory
`);

  await writeFile(join(codexDir, 'skills', 'demo-skill', 'SKILL.md'), `# Demo Skill

Use this for adapter smoke tests.
`);

  await writeFile(join(codexDir, 'skills', '.system', 'system-skill', 'SKILL.md'), `# System Skill

Nested system skill layout.
`);

  await writeFile(join(codexDir, 'rules', 'default.rules'), 'always respond with concise engineering notes\n');

  await writeFile(join(codexDir, 'plugins', 'cache', 'openai-curated', 'github', 'abc123', '.codex-plugin', 'plugin.json'), JSON.stringify({
    name: 'github',
    description: 'GitHub plugin',
  }, null, 2));

  return {
    home,
    async cleanup() {
      await rm(home, { recursive: true, force: true });
    },
  };
}

async function createCodexProjectHome() {
  const home = await mkdtemp(join(tmpdir(), 'cco-codex-project-'));
  const projectDir = join(home, 'work', 'demo-repo');
  const nestedDir = join(projectDir, 'packages', 'api');
  const codexDir = join(home, '.codex');

  await mkdir(join(projectDir, '.git'), { recursive: true });
  await mkdir(join(projectDir, '.codex', 'skills', 'repo-skill'), { recursive: true });
  await mkdir(join(projectDir, '.agents', 'skills', 'agents-skill'), { recursive: true });
  await mkdir(nestedDir, { recursive: true });
  await mkdir(codexDir, { recursive: true });

  await writeFile(join(codexDir, 'config.toml'), `
[projects."${projectDir}"]
trust_level = "trusted"
`);

  await writeFile(join(projectDir, 'AGENTS.md'), '# Repo Instructions\nUse npm test.\n');
  await writeFile(join(projectDir, '.codex', 'config.toml'), `
[profiles.repo]
sandbox_mode = "workspace-write"

[mcp_servers.repo_mcp]
command = "node"
args = ["server.mjs"]
`);
  await writeFile(join(projectDir, '.codex', 'skills', 'repo-skill', 'SKILL.md'), `# Repo Skill

Use inside this repo.
`);
  await writeFile(join(projectDir, '.agents', 'skills', 'agents-skill', 'SKILL.md'), `# Agents Skill

Shared repo skill root.
`);

  return {
    home,
    projectDir,
    nestedDir,
    async cleanup() {
      await rm(home, { recursive: true, force: true });
    },
  };
}

describe('Codex adapter', () => {
  it('is discoverable through the harness registry', async () => {
    const adapter = await getAdapter('codex');
    assert.strictEqual(adapter.id, 'codex');
    assert.strictEqual(adapter.displayName, 'Codex CLI');
  });

  it('loads and scans ~/.codex inventory', async () => {
    const env = await createCodexHome();
    try {
      const result = await scanHarness(codexAdapter, { home: env.home, cwd: env.home });

      assert.strictEqual(result.harness.id, 'codex');
      assert.deepStrictEqual(result.scopes.map(scope => scope.id), ['global']);
      assert.strictEqual(result.counts.config, 1);
      assert.strictEqual(result.counts.memory, 1);
      assert.strictEqual(result.counts.skill, 2);
      assert.strictEqual(result.counts.mcp, 2);
      assert.strictEqual(result.counts.profile, 1);
      assert.strictEqual(result.counts.rule, 1);
      assert.strictEqual(result.counts.plugin, 1);

      assert.ok(result.items.some(item => item.category === 'config' && item.name === 'config.toml'));
      assert.ok(result.items.some(item => item.category === 'memory' && item.name === 'Project Memory'));
      assert.ok(result.items.some(item => item.category === 'skill' && item.name === 'demo-skill'));
      assert.ok(result.items.some(item => item.category === 'skill' && item.name === '.system/system-skill'));
      assert.ok(result.items.some(item => item.category === 'mcp' && item.name === 'context7' && item.mcpConfig.command === 'npx'));
      assert.ok(result.items.some(item => item.category === 'mcp' && item.name === 'remote' && item.mcpConfig.url === 'https://example.com/mcp'));
      assert.ok(result.items.some(item => item.category === 'profile' && item.name === 'review'));
      assert.ok(result.items.some(item => item.category === 'rule' && item.name === 'default.rules'));
      assert.ok(result.items.some(item => item.category === 'plugin' && item.name === 'github'));
    } finally {
      await env.cleanup();
    }
  });

  it('models Codex project config from repo roots instead of Claude encoded scopes', async () => {
    const env = await createCodexProjectHome();
    try {
      const result = await scanHarness(codexAdapter, { home: env.home, cwd: env.nestedDir });
      const projectScope = result.scopes.find(scope => scope.repoDir === env.projectDir);

      assert.ok(projectScope, 'project scope should come from the repo path');
      assert.strictEqual(projectScope.trustLevel, 'trusted');
      assert.deepStrictEqual(projectScope.codexScopeSources, ['cwd', 'trust']);

      assert.ok(result.items.some(item =>
        item.scopeId === projectScope.id &&
        item.category === 'config' &&
        item.name === 'config.toml project entry' &&
        item.subType === 'project-trust'
      ));
      assert.ok(result.items.some(item =>
        item.scopeId === projectScope.id &&
        item.category === 'config' &&
        item.name === 'AGENTS.md'
      ));
      assert.ok(result.items.some(item =>
        item.scopeId === projectScope.id &&
        item.category === 'config' &&
        item.name === '.codex/config.toml'
      ));
      assert.ok(result.items.some(item =>
        item.scopeId === projectScope.id &&
        item.category === 'skill' &&
        item.name === 'repo-skill' &&
        item.sourceFile === '.codex/skills'
      ));
      assert.ok(result.items.some(item =>
        item.scopeId === projectScope.id &&
        item.category === 'skill' &&
        item.name === 'agents-skill' &&
        item.sourceFile === '.agents/skills'
      ));
      assert.ok(result.items.some(item =>
        item.scopeId === projectScope.id &&
        item.category === 'mcp' &&
        item.name === 'repo_mcp' &&
        item.mcpConfig.command === 'node'
      ));
      assert.ok(result.items.some(item =>
        item.scopeId === projectScope.id &&
        item.category === 'profile' &&
        item.name === 'repo'
      ));
    } finally {
      await env.cleanup();
    }
  });
});
