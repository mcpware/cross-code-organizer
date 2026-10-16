import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getAdapter } from '../../src/harness/registry.mjs';
import { scanHarness } from '../../src/harness/scanner-framework.mjs';
import { codexAdapter } from '../../src/harness/adapters/codex.mjs';

async function createCodexHome() {
  const home = await mkdtemp(join(tmpdir(), 'cco-codex-adapter-'));
  const codexDir = join(home, '.codex');

  // Keep project-root discovery inside this fixture. Shared CI/dev machines may
  // have unrelated `.git` or `.codex` directories higher up under the OS temp
  // directory, which must not leak into this global-inventory test.
  await mkdir(join(home, '.git'), { recursive: true });
  await mkdir(join(codexDir, 'memories'), { recursive: true });
  await mkdir(join(codexDir, 'memories', 'rollout_summaries'), { recursive: true });
  await mkdir(join(codexDir, 'skills', 'demo-skill'), { recursive: true });
  await mkdir(join(codexDir, 'skills', '.system', 'system-skill'), { recursive: true });
  await mkdir(join(codexDir, 'agents'), { recursive: true });
  await mkdir(join(codexDir, 'rules'), { recursive: true });
  await mkdir(join(codexDir, 'hooks'), { recursive: true });
  await mkdir(join(codexDir, 'plugins', 'cache', 'openai-curated', 'github', 'abc123', '.codex-plugin'), { recursive: true });
  await mkdir(join(codexDir, 'plugins', 'cache', 'openai-curated', 'github', 'abc123', 'skills', 'plugin-skill'), { recursive: true });
  await mkdir(join(codexDir, 'plugins', 'cache', 'openai-curated', 'github', 'abc123', 'hooks'), { recursive: true });

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

[skills.bundled]
enabled = false

[[skills.config]]
path = "${join(codexDir, 'skills', 'demo-skill', 'SKILL.md').replaceAll('\\', '/')}"
enabled = false

[[hooks.PreToolUse]]
matcher = "^shell$"

[[hooks.PreToolUse.hooks]]
type = "command"
command = "python3 ~/.codex/hooks/validate.py"
`);

  await writeFile(join(codexDir, 'fast.config.toml'), `
model = "gpt-5.5"
sandbox_mode = "workspace-write"
`);

  await writeFile(join(codexDir, 'memories', 'project.md'), `---
name: Project Memory
description: Important project context
type: project
---
# Project Memory
`);

  await writeFile(join(codexDir, 'memories', 'rollout_summaries', 'recent.md'), `# Recent rollout

Remember the adapter regression.
`);

  await writeFile(join(codexDir, 'skills', 'demo-skill', 'SKILL.md'), `---
name: demo-skill
description: Use this for adapter smoke tests.
---
# Demo Skill

Use this for adapter smoke tests.
`);

  await writeFile(join(codexDir, 'skills', '.system', 'system-skill', 'SKILL.md'), `# System Skill

Nested system skill layout.
`);

  await writeFile(join(codexDir, 'agents', 'reviewer.toml'), `
name = "reviewer"
description = "Review code for correctness and security."
developer_instructions = "Lead with concrete findings."
model = "gpt-5.6-terra"
sandbox_mode = "read-only"
`);

  await writeFile(join(codexDir, 'rules', 'default.rules'), 'always respond with concise engineering notes\n');
  await writeFile(join(codexDir, 'hooks', 'validate.py'), 'print("validate")\n');
  await writeFile(join(codexDir, 'hooks.json'), JSON.stringify({
    description: 'Test hooks',
    hooks: { PreToolUse: [], PostToolUse: [] },
  }, null, 2));

  await writeFile(join(codexDir, 'plugins', 'cache', 'openai-curated', 'github', 'abc123', '.codex-plugin', 'plugin.json'), JSON.stringify({
    name: 'github',
    description: 'GitHub plugin',
    hooks: ['./hooks/hooks.json', './hooks/escape.json'],
  }, null, 2));
  await writeFile(join(codexDir, 'plugins', 'cache', 'openai-curated', 'github', 'abc123', 'skills', 'plugin-skill', 'SKILL.md'), `# Plugin Skill

Installed with the GitHub plugin.
`);
  await writeFile(join(codexDir, 'plugins', 'cache', 'openai-curated', 'github', 'abc123', 'hooks', 'hooks.json'), JSON.stringify({
    hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'node start.mjs' }] }] },
  }, null, 2));
  const outsideHooks = join(home, 'outside-hooks.json');
  await writeFile(outsideHooks, JSON.stringify({ hooks: { Stop: [] } }));
  await symlink(outsideHooks, join(codexDir, 'plugins', 'cache', 'openai-curated', 'github', 'abc123', 'hooks', 'escape.json'));

  return {
    home,
    async cleanup() {
      await rm(home, { recursive: true, force: true });
    },
  };
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function createCodexProjectHome() {
  const home = await mkdtemp(join(tmpdir(), 'cco-codex-project-'));
  const projectDir = join(home, 'work', 'demo-repo');
  const nestedDir = join(projectDir, 'packages', 'api');
  const codexDir = join(home, '.codex');

  await mkdir(join(projectDir, '.git'), { recursive: true });
  await mkdir(join(projectDir, '.codex', 'skills', 'repo-skill'), { recursive: true });
  await mkdir(join(projectDir, '.codex', 'agents'), { recursive: true });
  await mkdir(join(projectDir, '.codex', 'hooks'), { recursive: true });
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

[[hooks.PostToolUse]]
matcher = "^shell$"

[[hooks.PostToolUse.hooks]]
type = "command"
command = "node .codex/hooks/audit.mjs"
`);
  await writeFile(join(projectDir, '.codex', 'hooks.json'), JSON.stringify({
    hooks: { SessionEnd: [] },
  }, null, 2));
  await writeFile(join(projectDir, '.codex', 'hooks', 'audit.mjs'), 'console.log("audit")\n');
  await writeFile(join(projectDir, '.codex', 'agents', 'repo-reviewer.toml'), `
name = "repo_reviewer"
description = "Review this repository."
developer_instructions = "Use repository policy."
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
      assert.strictEqual(result.counts.memory, 2);
      assert.strictEqual(result.counts.skill, 3);
      assert.strictEqual(result.counts.agent, 1);
      assert.strictEqual(result.counts.mcp, 2);
      assert.strictEqual(result.counts.profile, 2);
      assert.strictEqual(result.counts.rule, 1);
      assert.strictEqual(result.counts.plugin, 1);
      assert.strictEqual(result.counts.hook, 4);

      assert.ok(result.items.some(item => item.category === 'config' && item.name === 'config.toml'));
      assert.ok(result.items.some(item => item.category === 'memory' && item.name === 'Project Memory'));
      assert.ok(result.items.some(item => item.category === 'memory' && item.name === 'rollout_summaries/recent' && item.subType === 'rollout-summary'));
      assert.ok(result.items.some(item => item.category === 'skill' && item.name === 'demo-skill'));
      assert.ok(result.items.some(item => item.category === 'skill' && item.name === '.system/system-skill'));
      assert.ok(result.items.some(item => item.category === 'skill' && item.name === 'plugin-skill' && item.sourceFile === 'plugin:github'));
      assert.ok(result.items.some(item => item.category === 'mcp' && item.name === 'context7' && item.mcpConfig.command === 'npx'));
      assert.ok(result.items.some(item => item.category === 'mcp' && item.name === 'remote' && item.mcpConfig.url === 'https://example.com/mcp'));
      assert.ok(result.items.some(item => item.category === 'profile' && item.name === 'review'));
      assert.ok(result.items.some(item => item.category === 'profile' && item.name === 'fast' && item.subType === 'profile-file'));
      assert.ok(result.items.some(item => item.category === 'agent' && item.name === 'reviewer' && item.value.model === 'gpt-5.6-terra'));
      assert.ok(result.items.some(item => item.category === 'rule' && item.name === 'default.rules'));
      assert.ok(result.items.some(item => item.category === 'plugin' && item.name === 'github'));
      assert.ok(result.items.some(item => item.category === 'hook' && item.name === 'validate.py'));
      assert.ok(result.items.some(item => item.category === 'hook' && item.name === 'hooks.json' && item.subType === 'hook-config'));
      assert.ok(result.items.some(item => item.category === 'hook' && item.name === 'config.toml inline hooks' && item.subType === 'inline-hook-config'));
      assert.ok(result.items.some(item => item.category === 'hook' && item.name === 'github: hooks/hooks.json' && item.subType === 'plugin-hook-config'));
      assert.equal(result.items.some(item => item.category === 'hook' && item.path === join(env.home, 'outside-hooks.json')), false);
      assert.strictEqual(result.items.find(item => item.category === 'skill' && item.name === 'demo-skill').enabled, false);
      assert.strictEqual(result.items.find(item => item.category === 'skill' && item.name === 'demo-skill').enablementSource, 'config.toml [[skills.config]]');
      assert.strictEqual(result.items.find(item => item.category === 'skill' && item.name === '.system/system-skill').enabled, false);
      assert.strictEqual(result.items.find(item => item.category === 'skill' && item.name === '.system/system-skill').enablementSource, 'config.toml [skills.bundled]');
      assert.strictEqual(result.items.find(item => item.category === 'skill' && item.name === 'demo-skill').locked, false);
      assert.strictEqual(result.items.find(item => item.category === 'skill' && item.name === '.system/system-skill').locked, true);
      assert.strictEqual(result.items.find(item => item.category === 'skill' && item.name === 'plugin-skill').locked, true);
      assert.strictEqual(result.items.find(item => item.category === 'plugin' && item.name === 'github').locked, true);
    } finally {
      await env.cleanup();
    }
  });

  it('honors a custom CODEX_HOME instead of scanning the default directory', async () => {
    const home = await mkdtemp(join(tmpdir(), 'cco-codex-home-'));
    const customCodexHome = join(home, 'custom-codex');
    try {
      await mkdir(join(home, '.codex'), { recursive: true });
      await writeFile(join(home, '.codex', 'config.toml'), 'model = "wrong-default-home"\n');
      await mkdir(join(customCodexHome, 'memories'), { recursive: true });
      await writeFile(join(customCodexHome, 'config.toml'), 'model = "gpt-5.5"\n');
      await writeFile(join(customCodexHome, 'memories', 'custom.md'), '# Custom Home Memory\n');

      const result = await scanHarness(codexAdapter, {
        home,
        cwd: home,
        env: { CODEX_HOME: customCodexHome },
      });

      assert.ok(result.items.some(item => item.category === 'config' && item.path === join(customCodexHome, 'config.toml')));
      assert.ok(result.items.some(item => item.category === 'memory' && item.path === join(customCodexHome, 'memories', 'custom.md')));
      assert.equal(result.items.some(item => item.path.startsWith(join(home, '.codex'))), false);
      assert.equal(codexAdapter.getPaths({ home, env: { CODEX_HOME: customCodexHome } }).rootDir, customCodexHome);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it('deletes Codex file and directory items that are marked deletable', async () => {
    const env = await createCodexHome();
    try {
      const result = await scanHarness(codexAdapter, { home: env.home, cwd: env.home });
      const targets = [
        result.items.find(item => item.category === 'memory' && item.name === 'Project Memory'),
        result.items.find(item => item.category === 'skill' && item.name === 'demo-skill'),
        result.items.find(item => item.category === 'agent' && item.name === 'reviewer'),
        result.items.find(item => item.category === 'rule' && item.name === 'default.rules'),
      ];

      for (const item of targets) {
        assert.ok(item, `missing ${item?.category || 'target'} test item`);
        const response = await codexAdapter.operations.deleteItem(item, result.scopes);
        assert.strictEqual(response.ok, true);
        assert.strictEqual(await exists(item.path), false);
      }
    } finally {
      await env.cleanup();
    }
  });

  it('returns structured unsupported responses for Codex moves', async () => {
    const result = await codexAdapter.operations.moveItem({ category: 'memory', name: 'x' }, 'global', []);
    assert.deepStrictEqual(result, {
      ok: false,
      error: 'Codex adapter does not support moving items yet',
    });
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
      assert.ok(result.items.some(item =>
        item.scopeId === projectScope.id &&
        item.category === 'agent' &&
        item.name === 'repo_reviewer'
      ));
      assert.ok(result.items.some(item =>
        item.scopeId === projectScope.id &&
        item.category === 'hook' &&
        item.name === 'hooks.json'
      ));
      assert.ok(result.items.some(item =>
        item.scopeId === projectScope.id &&
        item.category === 'hook' &&
        item.name === 'config.toml inline hooks'
      ));
      assert.ok(result.items.some(item =>
        item.scopeId === projectScope.id &&
        item.category === 'hook' &&
        item.name === 'audit.mjs'
      ));
    } finally {
      await env.cleanup();
    }
  });
});
