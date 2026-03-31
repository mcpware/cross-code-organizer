/**
 * Unit tests for Show Effective per-category rules.
 *
 * These test the LOGIC of effective resolution without a browser.
 * The functions mirror what app.js does client-side.
 *
 * Run: node --test tests/unit/test-effective-rules.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ── Re-implement the client-side effective logic for testability ────
// These mirror computeEffectiveSets + getVisibleItemsForScope in app.js

const EFFECTIVE_CATEGORIES = new Set([
  'skill', 'mcp', 'command', 'agent', 'config', 'hook', 'memory',
]);

function computeEffectiveSets(scopeId, projectItems, globalItems, allScopes) {
  const shadowedKeys = new Set();
  const conflictKeys = new Set();
  const ancestorKeys = new Set();

  if (scopeId === 'global') return { shadowedKeys, conflictKeys, ancestorKeys };

  const itemKey = (i) => `${i.category}::${i.name}::${i.scopeId}`;

  // MCP & Agents: narrower scope (project) wins same-name
  for (const cat of ['mcp', 'agent']) {
    const projectNames = new Set(
      projectItems.filter(i => i.category === cat).map(i => i.name)
    );
    for (const gi of globalItems.filter(i => i.category === cat)) {
      if (projectNames.has(gi.name)) shadowedKeys.add(itemKey(gi));
    }
  }

  // Commands: same-name = conflict (not reliably resolved)
  const projCmdNames = new Set(projectItems.filter(i => i.category === 'command').map(i => i.name));
  const globalCmdNames = new Set(globalItems.filter(i => i.category === 'command').map(i => i.name));
  for (const name of projCmdNames) {
    if (!globalCmdNames.has(name)) continue;
    for (const i of [...projectItems, ...globalItems].filter(i => i.category === 'command' && i.name === name)) {
      conflictKeys.add(itemKey(i));
    }
  }

  // Ancestor scopes
  const scope = allScopes.find(s => s.id === scopeId);
  if (scope?.repoDir) {
    const ancestors = allScopes.filter(s =>
      s.repoDir && s.id !== scopeId && s.id !== 'global' &&
      scope.repoDir.startsWith(s.repoDir + '/')
    );
    for (const as of ancestors) {
      // Items from ancestor scopes
      const ancestorItems = allItems.filter(i => i.scopeId === as.id && (i.category === 'config' || i.category === 'memory'));
      for (const i of ancestorItems) {
        ancestorKeys.add(itemKey(i));
      }
    }
  }

  return { shadowedKeys, conflictKeys, ancestorKeys };
}

function getEffectiveItems(scopeId, allItems, allScopes) {
  const projectItems = allItems.filter(i => i.scopeId === scopeId);
  const globalItems = allItems.filter(i => i.scopeId === 'global');

  // Only add global items for categories with effectiveRule
  const effectiveGlobal = globalItems.filter(i => EFFECTIVE_CATEGORIES.has(i.category));

  // Ancestor items (config/memory from parent path scopes)
  const scope = allScopes.find(s => s.id === scopeId);
  const ancestorItems = [];
  if (scope?.repoDir) {
    const ancestors = allScopes.filter(s =>
      s.repoDir && s.id !== scopeId && s.id !== 'global' &&
      scope.repoDir.startsWith(s.repoDir + '/')
    );
    for (const as of ancestors) {
      ancestorItems.push(
        ...allItems.filter(i => i.scopeId === as.id && (i.category === 'config' || i.category === 'memory'))
      );
    }
  }

  return [...projectItems, ...effectiveGlobal, ...ancestorItems];
}

// ── Fixtures ───────────────────────────────────────────────────────

// allItems is used by computeEffectiveSets ancestor detection
let allItems;

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
  { category: 'mcp', name: 'github', scopeId: 'repo-a' },       // same name as global → shadows
  { category: 'command', name: 'deploy', scopeId: 'repo-a' },    // same name as global → conflict
  { category: 'agent', name: 'planner', scopeId: 'repo-a' },     // same name as global → shadows
  { category: 'config', name: 'settings.json', scopeId: 'repo-a' },
  { category: 'memory', name: 'project_notes', scopeId: 'repo-a' },
  { category: 'plan', name: 'sprint', scopeId: 'repo-a' },
  { category: 'rule', name: 'no-console', scopeId: 'repo-a' },
];

allItems = ITEMS;

// ── Tests ──────────────────────────────────────────────────────────

describe('Show Effective — categories that participate', () => {

  it('skills: shows project + global skills', () => {
    const effective = getEffectiveItems('repo-a', ITEMS, SCOPES);
    const skills = effective.filter(i => i.category === 'skill');
    const names = skills.map(i => i.name).sort();
    assert.deepStrictEqual(names, ['deploy', 'lint', 'local-build']);
  });

  it('mcp: shows project + global MCP servers', () => {
    const effective = getEffectiveItems('repo-a', ITEMS, SCOPES);
    const mcps = effective.filter(i => i.category === 'mcp');
    const names = mcps.map(i => i.name).sort();
    // Both "github" entries appear (project + global) — UI marks global as Shadowed
    assert.ok(names.includes('github'));
    assert.ok(names.includes('slack'));
  });

  it('commands: shows project + global commands', () => {
    const effective = getEffectiveItems('repo-a', ITEMS, SCOPES);
    const cmds = effective.filter(i => i.category === 'command');
    const names = cmds.map(i => i.name).sort();
    assert.deepStrictEqual(names, ['deploy', 'deploy', 'test']); // deploy appears twice (conflict)
  });

  it('agents: shows project + global agents', () => {
    const effective = getEffectiveItems('repo-a', ITEMS, SCOPES);
    const agents = effective.filter(i => i.category === 'agent');
    const names = agents.map(i => i.name).sort();
    assert.deepStrictEqual(names, ['planner', 'planner', 'reviewer']); // planner twice (shadow)
  });

  it('config: shows project + global + ancestor CLAUDE.md', () => {
    const effective = getEffectiveItems('repo-a', ITEMS, SCOPES);
    const configs = effective.filter(i => i.category === 'config');
    const sources = configs.map(i => `${i.name}@${i.scopeId}`).sort();
    assert.ok(sources.includes('CLAUDE.md@global'), 'global CLAUDE.md');
    assert.ok(sources.includes('CLAUDE.md@company'), 'ancestor CLAUDE.md from company');
    assert.ok(sources.includes('settings.json@repo-a'), 'project settings.json');
  });

  it('memory: shows project + global + ancestor memories', () => {
    const effective = getEffectiveItems('repo-a', ITEMS, SCOPES);
    const mems = effective.filter(i => i.category === 'memory');
    const sources = mems.map(i => `${i.name}@${i.scopeId}`).sort();
    assert.ok(sources.includes('user_prefs@global'), 'global memory');
    assert.ok(sources.includes('project_notes@repo-a'), 'project memory');
    assert.ok(sources.includes('company_standards@company'), 'ancestor memory');
  });

  it('hooks: shows project + global hooks', () => {
    const effective = getEffectiveItems('repo-a', ITEMS, SCOPES);
    const hooks = effective.filter(i => i.category === 'hook');
    assert.ok(hooks.some(i => i.scopeId === 'global'), 'global hook present');
  });
});

describe('Show Effective — categories that DO NOT participate', () => {

  it('plans from global are NOT included', () => {
    const effective = getEffectiveItems('repo-a', ITEMS, SCOPES);
    const plans = effective.filter(i => i.category === 'plan');
    // Only repo-a plan, not global roadmap
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
    assert.strictEqual(sessions.length, 0); // repo-a has no sessions
  });
});

describe('Effective status detection — shadowed / conflict', () => {

  it('MCP: global "github" is shadowed by project "github"', () => {
    const projectItems = ITEMS.filter(i => i.scopeId === 'repo-a');
    const globalItems = ITEMS.filter(i => i.scopeId === 'global');
    const { shadowedKeys } = computeEffectiveSets('repo-a', projectItems, globalItems, SCOPES);
    const shadowed = [...shadowedKeys];
    assert.ok(shadowed.some(k => k.includes('mcp::github::global')), 'global github should be shadowed');
    assert.ok(!shadowed.some(k => k.includes('mcp::slack')), 'slack should NOT be shadowed');
  });

  it('Agent: global "planner" is shadowed by project "planner"', () => {
    const projectItems = ITEMS.filter(i => i.scopeId === 'repo-a');
    const globalItems = ITEMS.filter(i => i.scopeId === 'global');
    const { shadowedKeys } = computeEffectiveSets('repo-a', projectItems, globalItems, SCOPES);
    const shadowed = [...shadowedKeys];
    assert.ok(shadowed.some(k => k.includes('agent::planner::global')), 'global planner should be shadowed');
    assert.ok(!shadowed.some(k => k.includes('agent::reviewer')), 'reviewer should NOT be shadowed');
  });

  it('Command: "deploy" in both scopes is flagged as conflict', () => {
    const projectItems = ITEMS.filter(i => i.scopeId === 'repo-a');
    const globalItems = ITEMS.filter(i => i.scopeId === 'global');
    const { conflictKeys } = computeEffectiveSets('repo-a', projectItems, globalItems, SCOPES);
    const conflicts = [...conflictKeys];
    // Both the project and global deploy should be conflicts
    assert.ok(conflicts.some(k => k.includes('command::deploy::global')), 'global deploy should be conflict');
    assert.ok(conflicts.some(k => k.includes('command::deploy::repo-a')), 'project deploy should be conflict');
    assert.ok(!conflicts.some(k => k.includes('command::test')), 'test command should NOT be conflict');
  });

  it('MCP: no shadowing when names are unique', () => {
    const projectItems = ITEMS.filter(i => i.scopeId === 'repo-a');
    const globalItems = ITEMS.filter(i => i.scopeId === 'global');
    const { shadowedKeys } = computeEffectiveSets('repo-a', projectItems, globalItems, SCOPES);
    assert.ok(![...shadowedKeys].some(k => k.includes('slack')), 'unique names should not be shadowed');
  });

  it('global scope has no shadowing or conflicts', () => {
    const projectItems = ITEMS.filter(i => i.scopeId === 'global');
    const globalItems = [];
    const { shadowedKeys, conflictKeys } = computeEffectiveSets('global', projectItems, globalItems, SCOPES);
    assert.strictEqual(shadowedKeys.size, 0);
    assert.strictEqual(conflictKeys.size, 0);
  });
});

describe('Ancestor scope detection', () => {

  it('repo-a sees company as ancestor scope', () => {
    const effective = getEffectiveItems('repo-a', ITEMS, SCOPES);
    const ancestorConfigs = effective.filter(i => i.scopeId === 'company');
    assert.ok(ancestorConfigs.length > 0, 'ancestor items should be included');
    assert.ok(ancestorConfigs.some(i => i.name === 'CLAUDE.md'), 'ancestor CLAUDE.md should be present');
    assert.ok(ancestorConfigs.some(i => i.name === 'company_standards'), 'ancestor memory should be present');
  });

  it('company does NOT see repo-a as ancestor (children are not ancestors)', () => {
    const effective = getEffectiveItems('company', ITEMS, SCOPES);
    const repoItems = effective.filter(i => i.scopeId === 'repo-a');
    assert.strictEqual(repoItems.length, 0, 'child scope items should not appear as ancestors');
  });

  it('global has no ancestors', () => {
    const effective = getEffectiveItems('global', ITEMS, SCOPES);
    const nonGlobal = effective.filter(i => i.scopeId !== 'global');
    assert.strictEqual(nonGlobal.length, 0, 'global should not include any other scope');
  });
});
