import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanHarness } from '../../src/harness/scanner-framework.mjs';
import { claudeAdapter } from '../../src/harness/adapters/claude.mjs';

function encodeClaudeProjectName(realPath) {
  return realPath.replace(/[^A-Za-z0-9-]/g, '-');
}

async function createClaudeHome(prefix = 'cco-claude-regression-') {
  const home = await mkdtemp(join(tmpdir(), prefix));
  await mkdir(join(home, '.claude', 'projects'), { recursive: true });
  return {
    home,
    async cleanup() {
      await rm(home, { recursive: true, force: true });
    },
  };
}

async function createProjectScope(home, repoDir, encodedName = encodeClaudeProjectName(repoDir)) {
  await mkdir(repoDir, { recursive: true });
  const claudeProjectDir = join(home, '.claude', 'projects', encodedName);
  await mkdir(claudeProjectDir, { recursive: true });
  await writeFile(join(claudeProjectDir, 'session.jsonl'), JSON.stringify({ cwd: repoDir, type: 'user' }) + '\n');
  return { encodedName, claudeProjectDir };
}

async function createSkill(root, name, heading = name) {
  await mkdir(join(root, name), { recursive: true });
  await writeFile(join(root, name, 'SKILL.md'), `# ${heading}\n\nUse this test skill.\n`);
}

describe('Claude adapter regressions from scanner PRs', () => {
  it('scans user and project plugin-provided skills from installed_plugins.json', async () => {
    const env = await createClaudeHome();
    try {
      const repoDir = join(env.home, 'work', 'demo-repo');
      await createProjectScope(env.home, repoDir);

      const userPlugin = join(env.home, '.claude', 'plugins', 'cache', 'market', 'user-plugin', '1.0.0');
      const projectPlugin = join(env.home, '.claude', 'plugins', 'cache', 'market', 'project-plugin', '1.0.0');
      await createSkill(join(userPlugin, 'skills'), 'global-plugin-skill', 'Global Plugin Skill');
      await createSkill(join(projectPlugin, 'skills'), 'project-plugin-skill', 'Project Plugin Skill');

      await writeFile(join(env.home, '.claude', 'plugins', 'installed_plugins.json'), JSON.stringify({
        plugins: {
          'user-plugin@market': [
            { scope: 'user', installPath: userPlugin },
          ],
          'project-plugin@market': [
            { scope: 'project', projectPath: repoDir, installPath: projectPlugin },
          ],
        },
      }, null, 2));

      const result = await scanHarness(claudeAdapter, { home: env.home, cwd: repoDir, platform: 'darwin' });
      const projectScope = result.scopes.find(scope => scope.repoDir === repoDir);
      assert.ok(projectScope, 'project scope should be discovered');

      assert.ok(result.items.some(item =>
        item.category === 'skill' &&
        item.scopeId === 'global' &&
        item.name === 'global-plugin-skill' &&
        item.subType === 'plugin-skill' &&
        item.bundle === 'user-plugin@market'
      ));
      assert.ok(result.items.some(item =>
        item.category === 'skill' &&
        item.scopeId === projectScope.id &&
        item.name === 'project-plugin-skill' &&
        item.subType === 'plugin-skill' &&
        item.bundle === 'project-plugin@market'
      ));
    } finally {
      await env.cleanup();
    }
  });

  it('keeps unresolved encoded project scopes so memories and sessions stay visible', async () => {
    const env = await createClaudeHome();
    try {
      const encodedName = '-missing-project-with-memory';
      const claudeProjectDir = join(env.home, '.claude', 'projects', encodedName);
      await mkdir(join(claudeProjectDir, 'memory'), { recursive: true });
      await writeFile(join(claudeProjectDir, 'memory', 'note.md'), `---
name: Unresolved Note
description: Still visible without repoDir
---
# Note
`);
      await writeFile(join(claudeProjectDir, 'session.jsonl'), JSON.stringify({ type: 'user', message: 'hello' }) + '\n');

      const result = await scanHarness(claudeAdapter, { home: env.home, cwd: env.home, platform: 'darwin' });
      const unresolvedScope = result.scopes.find(scope => scope.id === encodedName);

      assert.ok(unresolvedScope, 'unresolved encoded project should still appear');
      assert.strictEqual(unresolvedScope.repoDir, null);
      assert.ok(result.items.some(item =>
        item.category === 'memory' &&
        item.scopeId === encodedName &&
        item.name === 'Unresolved Note'
      ));
      assert.ok(result.items.some(item =>
        item.category === 'session' &&
        item.scopeId === encodedName
      ));
    } finally {
      await env.cleanup();
    }
  });

  it('resolves encoded paths that traverse symlinked directories', async () => {
    const env = await createClaudeHome();
    try {
      const targetRoot = join(env.home, 'actual-root');
      const linkedRoot = join(env.home, 'linked-root');
      await mkdir(join(targetRoot, 'demo-repo'), { recursive: true });
      await symlink(targetRoot, linkedRoot, 'dir');

      const repoDir = join(linkedRoot, 'demo-repo');
      await createProjectScope(env.home, repoDir);

      const result = await scanHarness(claudeAdapter, { home: env.home, cwd: repoDir, platform: 'darwin' });

      assert.ok(result.scopes.some(scope => scope.repoDir === repoDir), 'scope should resolve through symlink path');
    } finally {
      await env.cleanup();
    }
  });
});
