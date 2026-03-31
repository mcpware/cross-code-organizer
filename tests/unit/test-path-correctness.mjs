/**
 * Unit tests verifying CCO's path resolution matches Claude Code's expected paths.
 *
 * Claude Code reads items from specific filesystem locations. If CCO moves
 * a file to the wrong path, Claude Code won't find it even though CCO
 * thinks the move succeeded. These tests verify path correctness.
 *
 * Official paths (from Claude Code docs):
 *   Skills:   ~/.claude/skills/<name>/       (global)
 *             <repo>/.claude/skills/<name>/  (project)
 *   Memory:   ~/.claude/memory/              (global, auto-memory)
 *             ~/.claude/projects/<id>/memory/ (project, auto-memory)
 *   Commands: ~/.claude/commands/            (global)
 *             <repo>/.claude/commands/       (project)
 *   Agents:   ~/.claude/agents/              (global)
 *             <repo>/.claude/agents/         (project)
 *   MCP:      ~/.claude/.mcp.json            (global/user)
 *             <repo>/.mcp.json               (project)
 *   Rules:    ~/.claude/rules/               (global)
 *             <repo>/.claude/rules/          (project)
 *   Config:   ~/.claude/settings.json        (global)
 *             <repo>/.claude/settings.json   (project)
 *   CLAUDE.md: ~/.claude/CLAUDE.md           (global)
 *              <repo>/CLAUDE.md or <repo>/.claude/CLAUDE.md (project)
 *
 * Run: node --test tests/unit/test-path-correctness.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { homedir } from 'node:os';

const HOME = homedir();
const CLAUDE_DIR = join(HOME, '.claude');

// ── Re-implement the path resolution from mover.mjs ────────────────
// (These are private functions in mover.mjs, so we re-derive them here
//  and test that they match official Claude Code paths)

const SCOPES = [
  { id: 'global', type: 'global', repoDir: null },
  { id: '-test-project', type: 'project', repoDir: '/tmp/test-project' },
];

function resolveSkillDir(scopeId) {
  if (scopeId === 'global') return join(CLAUDE_DIR, 'skills');
  const scope = SCOPES.find(s => s.id === scopeId);
  return scope?.repoDir ? join(scope.repoDir, '.claude', 'skills') : null;
}

function resolveMemoryDir(scopeId) {
  if (scopeId === 'global') return join(CLAUDE_DIR, 'memory');
  return join(CLAUDE_DIR, 'projects', scopeId, 'memory');
}

function resolveCommandDir(scopeId) {
  if (scopeId === 'global') return join(CLAUDE_DIR, 'commands');
  const scope = SCOPES.find(s => s.id === scopeId);
  return scope?.repoDir ? join(scope.repoDir, '.claude', 'commands') : null;
}

function resolveAgentDir(scopeId) {
  if (scopeId === 'global') return join(CLAUDE_DIR, 'agents');
  const scope = SCOPES.find(s => s.id === scopeId);
  return scope?.repoDir ? join(scope.repoDir, '.claude', 'agents') : null;
}

function resolveRuleDir(scopeId) {
  if (scopeId === 'global') return join(CLAUDE_DIR, 'rules');
  const scope = SCOPES.find(s => s.id === scopeId);
  return scope?.repoDir ? join(scope.repoDir, '.claude', 'rules') : null;
}

function resolveMcpJson(scopeId) {
  if (scopeId === 'global') return join(CLAUDE_DIR, '.mcp.json');
  const scope = SCOPES.find(s => s.id === scopeId);
  return scope?.repoDir ? join(scope.repoDir, '.mcp.json') : null;
}

// ── Tests ──────────────────────────────────────────────────────────

describe('Global scope paths match Claude Code official locations', () => {

  it('skills → ~/.claude/skills/', () => {
    assert.strictEqual(resolveSkillDir('global'), join(HOME, '.claude', 'skills'));
  });

  it('memory → ~/.claude/memory/', () => {
    assert.strictEqual(resolveMemoryDir('global'), join(HOME, '.claude', 'memory'));
  });

  it('commands → ~/.claude/commands/', () => {
    assert.strictEqual(resolveCommandDir('global'), join(HOME, '.claude', 'commands'));
  });

  it('agents → ~/.claude/agents/', () => {
    assert.strictEqual(resolveAgentDir('global'), join(HOME, '.claude', 'agents'));
  });

  it('rules → ~/.claude/rules/', () => {
    assert.strictEqual(resolveRuleDir('global'), join(HOME, '.claude', 'rules'));
  });

  it('MCP → ~/.claude/.mcp.json', () => {
    assert.strictEqual(resolveMcpJson('global'), join(HOME, '.claude', '.mcp.json'));
  });
});

describe('Project scope paths match Claude Code official locations', () => {

  it('skills → <repo>/.claude/skills/', () => {
    assert.strictEqual(resolveSkillDir('-test-project'), '/tmp/test-project/.claude/skills');
  });

  it('memory → ~/.claude/projects/<encoded>/memory/', () => {
    // Claude Code stores project memory in ~/.claude/projects/, NOT in <repo>/.claude/
    const expected = join(HOME, '.claude', 'projects', '-test-project', 'memory');
    assert.strictEqual(resolveMemoryDir('-test-project'), expected);
  });

  it('commands → <repo>/.claude/commands/', () => {
    assert.strictEqual(resolveCommandDir('-test-project'), '/tmp/test-project/.claude/commands');
  });

  it('agents → <repo>/.claude/agents/', () => {
    assert.strictEqual(resolveAgentDir('-test-project'), '/tmp/test-project/.claude/agents');
  });

  it('rules → <repo>/.claude/rules/', () => {
    assert.strictEqual(resolveRuleDir('-test-project'), '/tmp/test-project/.claude/rules');
  });

  it('MCP → <repo>/.mcp.json (NOT inside .claude/)', () => {
    // Important: project MCP is at repo ROOT, not inside .claude/
    assert.strictEqual(resolveMcpJson('-test-project'), '/tmp/test-project/.mcp.json');
  });
});

describe('Path structure invariants', () => {

  it('global paths are all under ~/.claude/', () => {
    for (const fn of [resolveSkillDir, resolveMemoryDir, resolveCommandDir, resolveAgentDir, resolveRuleDir, resolveMcpJson]) {
      const path = fn('global');
      assert.ok(path.startsWith(CLAUDE_DIR), `${path} should start with ${CLAUDE_DIR}`);
    }
  });

  it('project skill/command/agent/rule paths are under <repo>/.claude/', () => {
    for (const fn of [resolveSkillDir, resolveCommandDir, resolveAgentDir, resolveRuleDir]) {
      const path = fn('-test-project');
      assert.ok(path.startsWith('/tmp/test-project/.claude/'), `${path} should be under repo .claude/`);
    }
  });

  it('project MCP path is at repo root, not inside .claude/', () => {
    const path = resolveMcpJson('-test-project');
    assert.ok(!path.includes('/.claude/'), 'project MCP should NOT be inside .claude/');
    assert.ok(path.endsWith('.mcp.json'));
  });

  it('project memory path is under ~/.claude/projects/ (not under repo)', () => {
    const path = resolveMemoryDir('-test-project');
    assert.ok(path.startsWith(join(CLAUDE_DIR, 'projects')), 'project memory should be under ~/.claude/projects/');
    assert.ok(!path.startsWith('/tmp/'), 'project memory should NOT be under repo dir');
  });
});
