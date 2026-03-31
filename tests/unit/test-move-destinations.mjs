/**
 * Unit tests for mover.mjs — getValidDestinations
 *
 * Tests that each category returns correct allowed destinations
 * based on official Claude Code scope rules.
 *
 * Run: node --test tests/unit/test-move-destinations.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getValidDestinations } from '../../src/mover.mjs';

// ── Test fixtures ──────────────────────────────────────────────────

const HOME = process.env.HOME || '/home/testuser';

const SCOPES = [
  { id: 'global', name: 'Global', type: 'global', parentId: null, repoDir: null },
  { id: '-proj-a', name: 'project-a', type: 'project', parentId: 'global', repoDir: '/tmp/project-a' },
  { id: '-proj-b', name: 'project-b', type: 'project', parentId: 'global', repoDir: '/tmp/project-b' },
  // Home dir scope — its .claude IS global .claude (should be excluded for file-based items)
  { id: '-home', name: 'home', type: 'project', parentId: 'global', repoDir: HOME },
];

function makeItem(category, scopeId, name = 'test-item') {
  return { category, scopeId, name, path: `/fake/${name}`, locked: false };
}

function destIds(item) {
  return getValidDestinations(item, SCOPES).map(s => s.id).sort();
}

// ── Tests ──────────────────────────────────────────────────────────

describe('getValidDestinations — movable categories', () => {

  it('skill: can move to global and project scopes (not home-overlap)', () => {
    const item = makeItem('skill', '-proj-a');
    const dests = destIds(item);
    assert.ok(dests.includes('global'), 'global should be a destination');
    assert.ok(dests.includes('-proj-b'), 'other project should be a destination');
    assert.ok(!dests.includes('-proj-a'), 'current scope should NOT be a destination');
    assert.ok(!dests.includes('-home'), 'home scope should NOT be a destination (overlaps global .claude)');
  });

  it('memory: can move to global and project scopes (not home-overlap)', () => {
    const item = makeItem('memory', 'global');
    const dests = destIds(item);
    assert.ok(dests.includes('-proj-a'), 'project-a should be a destination');
    assert.ok(dests.includes('-proj-b'), 'project-b should be a destination');
    assert.ok(!dests.includes('global'), 'current scope (global) should NOT be a destination');
    assert.ok(!dests.includes('-home'), 'home scope should NOT be a destination');
  });

  it('command: can move to global and project scopes', () => {
    const item = makeItem('command', '-proj-a');
    const dests = destIds(item);
    assert.ok(dests.includes('global'));
    assert.ok(dests.includes('-proj-b'));
    assert.ok(!dests.includes('-proj-a'));
    assert.ok(!dests.includes('-home'));
  });

  it('agent: can move to global and project scopes', () => {
    const item = makeItem('agent', 'global');
    const dests = destIds(item);
    assert.ok(dests.includes('-proj-a'));
    assert.ok(dests.includes('-proj-b'));
    assert.ok(!dests.includes('global'));
    assert.ok(!dests.includes('-home'));
  });

  it('mcp: can move to ANY scope (including home-overlap)', () => {
    const item = makeItem('mcp', '-proj-a');
    const dests = destIds(item);
    assert.ok(dests.includes('global'), 'global should be a destination');
    assert.ok(dests.includes('-proj-b'), 'other project should be a destination');
    assert.ok(dests.includes('-home'), 'home scope IS valid for MCP (uses claudeProjectDir)');
    assert.ok(!dests.includes('-proj-a'), 'current scope should NOT be a destination');
  });
});

describe('getValidDestinations — locked categories', () => {

  it('plan: returns empty destinations', () => {
    const item = makeItem('plan', '-proj-a');
    assert.deepStrictEqual(destIds(item), []);
  });

  it('rule: returns empty destinations', () => {
    const item = makeItem('rule', '-proj-a');
    assert.deepStrictEqual(destIds(item), []);
  });

  it('config: returns empty (not in switch, falls to default)', () => {
    const item = makeItem('config', '-proj-a');
    assert.deepStrictEqual(destIds(item), []);
  });

  it('hook: returns empty', () => {
    const item = makeItem('hook', 'global');
    assert.deepStrictEqual(destIds(item), []);
  });

  it('plugin: returns empty', () => {
    const item = makeItem('plugin', 'global');
    assert.deepStrictEqual(destIds(item), []);
  });

  it('session: returns empty', () => {
    const item = makeItem('session', '-proj-a');
    assert.deepStrictEqual(destIds(item), []);
  });
});

describe('getValidDestinations — locked items', () => {

  it('locked item always returns empty regardless of category', () => {
    const item = { ...makeItem('skill', '-proj-a'), locked: true };
    assert.deepStrictEqual(destIds(item), []);
  });
});
