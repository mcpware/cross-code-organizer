/**
 * Unit tests for effective.mjs — the SAME module used by the dashboard.
 *
 * Tests per-category effective resolution: which items are visible,
 * which are shadowed, which have conflicts, and ancestor detection.
 *
 * Run: node --test tests/unit/test-effective-rules.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EFFECTIVE_RULES,
  hasEffectiveRule,
  getAncestorScopes,
  computeEffectiveSets,
  getEffectiveItems,
} from '../../src/effective.mjs';

// ── Key function (same as app.js) ──────────────────────────────────

const itemKey = (i) => `${i.category}::${i.name}::${i.scopeId}`;

// ── Fixtures ───────────────────────────────────────────────────────

const SCOPES = [
  { id: 'global', type: 'global', parentId: null, repoDir: null },
  { id: 'company', type: 'project', parentId: 'global', repoDir: '/work/company' },
  { id: 'repo-a', type: 'project', parentId: 'global', repoDir: '/work/company/repo-a' },
];

const ITEMS = [
  // Global items
  { category: 'skill', name: 'deploy', scopeId: 'global' },
  { category: 'skill', name: 'lint', scopeId: 'global' },
  { category: 'mcp', name: 'github', scopeId: 'global' },
  { category: 'mcp', name: 'slack', scopeId: 'global' },
  { category: 'command', name: 'test', scopeId: 'global' },
  { category: 'command', name: 'deploy', scopeId: 'global' },  // same name as project
  { category: 'agent', name: 'reviewer', scopeId: 'global' },
  { category: 'agent', name: 'planner', scopeId: 'global' },   // same name as project
  { category: 'config', name: 'CLAUDE.md', scopeId: 'global' },
  { category: 'memory', name: 'user_prefs', scopeId: 'global' },
  { category: 'plan', name: 'roadmap', scopeId: 'global' },
  { category: 'rule', name: 'no-eval', scopeId: 'global' },
  { category: 'session', name: 'session-1', scopeId: 'global' },
  { category: 'hook', name: 'pre-tool', scopeId: 'global' },

  // Company (ancestor of repo-a) items
  { category: 'config', name: 'CLAUDE.md', scopeId: 'company' },
  { category: 'memory', name: 'company_standards', scopeId: 'company' },

  // repo-a items
  { category: 'skill', name: 'local-build', scopeId: 'repo-a' },
  { category: 'mcp', name: 'github', scopeId: 'repo-a' },       // shadows global
  { category: 'command', name: 'deploy', scopeId: 'repo-a' },    // conflict with global
  { category: 'agent', name: 'planner', scopeId: 'repo-a' },     // shadows global
  { category: 'config', name: 'settings.json', scopeId: 'repo-a' },
  { category: 'memory', name: 'project_notes', scopeId: 'repo-a' },
  { category: 'plan', name: 'sprint', scopeId: 'repo-a' },
  { category: 'rule', name: 'no-console', scopeId: 'repo-a' },
];

// ── EFFECTIVE_RULES tests ──────────────────────────────────────────

describe('EFFECTIVE_RULES — category participation', () => {

  it('participating categories have rules', () => {
    for (const cat of ['skill', 'mcp', 'command', 'agent', 'config', 'hook', 'memory']) {
      assert.ok(hasEffectiveRule(cat), `${cat} should have an effective rule`);
      assert.ok(EFFECTIVE_RULES[cat], `${cat} rule text should be non-empty`);
    }
  });

  it('non-participating categories do NOT have rules', () => {
    for (const cat of ['plan', 'rule', 'session', 'plugin']) {
      assert.ok(!hasEffectiveRule(cat), `${cat} should NOT have an effective rule`);
    }
  });
});

// ── getEffectiveItems tests ────────────────────────────────────────

describe('getEffectiveItems — categories that participate', () => {

  it('skills: shows project + global skills', () => {
    const effective = getEffectiveItems('repo-a', ITEMS, SCOPES);
    const skills = effective.filter(i => i.category === 'skill');
    const names = skills.map(i => i.name).sort();
    assert.deepStrictEqual(names, ['deploy', 'lint', 'local-build']);
  });

  it('mcp: shows project + global MCP servers (both github entries)', () => {
    const effective = getEffectiveItems('repo-a', ITEMS, SCOPES);
    const mcps = effective.filter(i => i.category === 'mcp');
    assert.ok(mcps.some(i => i.name === 'github' && i.scopeId === 'repo-a'));
    assert.ok(mcps.some(i => i.name === 'github' && i.scopeId === 'global'));
    assert.ok(mcps.some(i => i.name === 'slack'));
  });

  it('commands: shows project + global commands (deploy appears twice)', () => {
    const effective = getEffectiveItems('repo-a', ITEMS, SCOPES);
    const cmds = effective.filter(i => i.category === 'command');
    const names = cmds.map(i => i.name).sort();
    assert.deepStrictEqual(names, ['deploy', 'deploy', 'test']);
  });

  it('agents: shows project + global agents (planner appears twice)', () => {
    const effective = getEffectiveItems('repo-a', ITEMS, SCOPES);
    const agents = effective.filter(i => i.category === 'agent');
    const names = agents.map(i => i.name).sort();
    assert.deepStrictEqual(names, ['planner', 'planner', 'reviewer']);
  });

  it('config: shows project + global + ancestor CLAUDE.md', () => {
    const effective = getEffectiveItems('repo-a', ITEMS, SCOPES);
    const configs = effective.filter(i => i.category === 'config');
    const sources = configs.map(i => `${i.name}@${i.scopeId}`).sort();
    assert.ok(sources.includes('CLAUDE.md@global'));
    assert.ok(sources.includes('CLAUDE.md@company'));
    assert.ok(sources.includes('settings.json@repo-a'));
  });

  it('memory: shows project + global + ancestor memories', () => {
    const effective = getEffectiveItems('repo-a', ITEMS, SCOPES);
    const mems = effective.filter(i => i.category === 'memory');
    const sources = mems.map(i => `${i.name}@${i.scopeId}`).sort();
    assert.ok(sources.includes('user_prefs@global'));
    assert.ok(sources.includes('project_notes@repo-a'));
    assert.ok(sources.includes('company_standards@company'));
  });

  it('hooks: shows project + global hooks', () => {
    const effective = getEffectiveItems('repo-a', ITEMS, SCOPES);
    const hooks = effective.filter(i => i.category === 'hook');
    assert.ok(hooks.some(i => i.scopeId === 'global'));
  });
});

describe('getEffectiveItems — categories that DO NOT participate', () => {

  it('plans from global are NOT included', () => {
    const effective = getEffectiveItems('repo-a', ITEMS, SCOPES);
    const plans = effective.filter(i => i.category === 'plan');
    assert.strictEqual(plans.length, 1);
    assert.strictEqual(plans[0].scopeId, 'repo-a');
  });

  it('rules from global are NOT included', () => {
    const effective = getEffectiveItems('repo-a', ITEMS, SCOPES);
    const rules = effective.filter(i => i.category === 'rule');
    assert.strictEqual(rules.length, 1);
    assert.strictEqual(rules[0].scopeId, 'repo-a');
  });

  it('sessions from global are NOT included', () => {
    const effective = getEffectiveItems('repo-a', ITEMS, SCOPES);
    const sessions = effective.filter(i => i.category === 'session');
    assert.strictEqual(sessions.length, 0);
  });
});

// ── computeEffectiveSets tests ─────────────────────────────────────

describe('computeEffectiveSets — shadowed / conflict detection', () => {

  it('MCP: global "github" is shadowed by project "github"', () => {
    const { shadowedKeys } = computeEffectiveSets('repo-a', ITEMS, SCOPES, itemKey);
    assert.ok([...shadowedKeys].some(k => k.includes('mcp::github::global')));
  });

  it('MCP: unique names are NOT shadowed', () => {
    const { shadowedKeys } = computeEffectiveSets('repo-a', ITEMS, SCOPES, itemKey);
    assert.ok(![...shadowedKeys].some(k => k.includes('slack')));
  });

  it('Agent: global "planner" is shadowed by project "planner"', () => {
    const { shadowedKeys } = computeEffectiveSets('repo-a', ITEMS, SCOPES, itemKey);
    assert.ok([...shadowedKeys].some(k => k.includes('agent::planner::global')));
  });

  it('Agent: unique names are NOT shadowed', () => {
    const { shadowedKeys } = computeEffectiveSets('repo-a', ITEMS, SCOPES, itemKey);
    assert.ok(![...shadowedKeys].some(k => k.includes('reviewer')));
  });

  it('Command: "deploy" in both scopes → both flagged as conflict', () => {
    const { conflictKeys } = computeEffectiveSets('repo-a', ITEMS, SCOPES, itemKey);
    assert.ok([...conflictKeys].some(k => k.includes('command::deploy::global')));
    assert.ok([...conflictKeys].some(k => k.includes('command::deploy::repo-a')));
  });

  it('Command: unique names are NOT conflicts', () => {
    const { conflictKeys } = computeEffectiveSets('repo-a', ITEMS, SCOPES, itemKey);
    assert.ok(![...conflictKeys].some(k => k.includes('test')));
  });

  it('global scope returns empty sets', () => {
    const { shadowedKeys, conflictKeys, ancestorKeys } = computeEffectiveSets('global', ITEMS, SCOPES, itemKey);
    assert.strictEqual(shadowedKeys.size, 0);
    assert.strictEqual(conflictKeys.size, 0);
    assert.strictEqual(ancestorKeys.size, 0);
  });
});

// ── Ancestor detection ─────────────────────────────────────────────

describe('getAncestorScopes', () => {

  it('repo-a sees company as ancestor', () => {
    const ancestors = getAncestorScopes('repo-a', SCOPES);
    assert.ok(ancestors.some(s => s.id === 'company'));
  });

  it('company does NOT see repo-a as ancestor', () => {
    const ancestors = getAncestorScopes('company', SCOPES);
    assert.ok(!ancestors.some(s => s.id === 'repo-a'));
  });

  it('global has no ancestors', () => {
    const ancestors = getAncestorScopes('global', SCOPES);
    assert.strictEqual(ancestors.length, 0);
  });

  it('ancestor config/memory items are in ancestorKeys', () => {
    const { ancestorKeys } = computeEffectiveSets('repo-a', ITEMS, SCOPES, itemKey);
    assert.ok([...ancestorKeys].some(k => k.includes('config::CLAUDE.md::company')));
    assert.ok([...ancestorKeys].some(k => k.includes('memory::company_standards::company')));
  });
});
