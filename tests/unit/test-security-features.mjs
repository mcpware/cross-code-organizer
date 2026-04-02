/**
 * Unit tests for security features added from ccsrc insights.
 *
 * Covers:
 *   - MCP dedup detection (signature-based, mirrors ccsrc config.ts)
 *   - MCP policy check (allowlist/denylist, mirrors ccsrc isMcpServerAllowedByPolicy)
 *
 * Run: node --test tests/unit/test-security-features.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectMcpDuplicates } from '../../src/security-scanner.mjs';
import { checkMcpPolicy } from '../../src/scanner.mjs';

// ── MCP Dedup Detection ──────────────────────────────────────────────

describe('detectMcpDuplicates', () => {

  it('returns empty array when no duplicates', () => {
    const items = [
      { name: 'server-a', scopeId: 'project-x', mcpConfig: { command: 'node', args: ['a.js'] } },
      { name: 'server-b', scopeId: 'project-x', mcpConfig: { command: 'python', args: ['b.py'] } },
    ];
    assert.deepStrictEqual(detectMcpDuplicates(items), []);
  });

  it('detects stdio duplicates by command+args signature', () => {
    const items = [
      { name: 'server-a', scopeId: 'project-x', mcpConfig: { command: 'node', args: ['server.js'] } },
      { name: 'server-a-copy', scopeId: 'global', mcpConfig: { command: 'node', args: ['server.js'] } },
    ];
    const dups = detectMcpDuplicates(items);
    assert.strictEqual(dups.length, 1);
    assert.strictEqual(dups[0].server, 'server-a-copy');
    assert.strictEqual(dups[0].duplicateOf, 'server-a');
    assert.strictEqual(dups[0].signatureType, 'stdio');
  });

  it('detects HTTP/URL duplicates', () => {
    const items = [
      { name: 'api-prod', scopeId: 'project-x', mcpConfig: { url: 'https://api.example.com/mcp' } },
      { name: 'api-alt', scopeId: 'global', mcpConfig: { url: 'https://api.example.com/mcp' } },
    ];
    const dups = detectMcpDuplicates(items);
    assert.strictEqual(dups.length, 1);
    assert.strictEqual(dups[0].signatureType, 'url');
  });

  it('does not flag different commands as duplicates', () => {
    const items = [
      { name: 'server-a', scopeId: 'global', mcpConfig: { command: 'node', args: ['a.js'] } },
      { name: 'server-b', scopeId: 'global', mcpConfig: { command: 'node', args: ['b.js'] } },
    ];
    assert.deepStrictEqual(detectMcpDuplicates(items), []);
  });

  it('skips items without mcpConfig', () => {
    const items = [
      { name: 'server-a', scopeId: 'global', mcpConfig: { command: 'node', args: ['a.js'] } },
      { name: 'server-b', scopeId: 'global' },
    ];
    assert.deepStrictEqual(detectMcpDuplicates(items), []);
  });

  it('skips disabled servers', () => {
    const items = [
      { name: 'server-a', scopeId: 'project-x', mcpConfig: { command: 'node', args: ['a.js'] } },
      { name: 'server-a-dup', scopeId: 'global', mcpConfig: { command: 'node', args: ['a.js'], disabled: true } },
    ];
    assert.deepStrictEqual(detectMcpDuplicates(items), []);
  });

  it('skips items with no command and no url (SDK servers)', () => {
    const items = [
      { name: 'sdk-a', scopeId: 'global', mcpConfig: { type: 'sdk' } },
      { name: 'sdk-b', scopeId: 'global', mcpConfig: { type: 'sdk' } },
    ];
    assert.deepStrictEqual(detectMcpDuplicates(items), []);
  });

  it('handles 3+ duplicates — first item wins', () => {
    const items = [
      { name: 'a', scopeId: 'local', mcpConfig: { command: 'x', args: [] } },
      { name: 'b', scopeId: 'project', mcpConfig: { command: 'x', args: [] } },
      { name: 'c', scopeId: 'global', mcpConfig: { command: 'x', args: [] } },
    ];
    const dups = detectMcpDuplicates(items);
    assert.strictEqual(dups.length, 2);
    assert.strictEqual(dups[0].duplicateOf, 'a');
    assert.strictEqual(dups[1].duplicateOf, 'a');
  });

  it('handles empty input', () => {
    assert.deepStrictEqual(detectMcpDuplicates([]), []);
  });

  it('returns correct scope info for duplicates', () => {
    const items = [
      { name: 'winner', scopeId: 'project-x', mcpConfig: { command: 'node', args: ['s.js'] } },
      { name: 'loser', scopeId: 'global', mcpConfig: { command: 'node', args: ['s.js'] } },
    ];
    const dups = detectMcpDuplicates(items);
    assert.strictEqual(dups[0].serverScope, 'global');
    assert.strictEqual(dups[0].winnerScope, 'project-x');
  });
});

// ── MCP Policy Check ─────────────────────────────────────────────────

describe('checkMcpPolicy', () => {

  it('returns "no-policy" when both lists are empty', () => {
    const policy = { allowlist: [], denylist: [] };
    assert.strictEqual(checkMcpPolicy('my-server', {}, policy), 'no-policy');
  });

  it('denylist has absolute precedence over allowlist', () => {
    const policy = {
      allowlist: [{ serverName: 'my-server' }],
      denylist: [{ serverName: 'my-server' }],
    };
    assert.strictEqual(checkMcpPolicy('my-server', {}, policy), 'denied');
  });

  it('allows server when in allowlist by name', () => {
    const policy = {
      allowlist: [{ serverName: 'my-server' }],
      denylist: [],
    };
    assert.strictEqual(checkMcpPolicy('my-server', {}, policy), 'allowed');
  });

  it('denies server not in allowlist when allowlist is set', () => {
    const policy = {
      allowlist: [{ serverName: 'other-server' }],
      denylist: [],
    };
    assert.strictEqual(checkMcpPolicy('my-server', {}, policy), 'denied');
  });

  it('denies by server name', () => {
    const policy = {
      allowlist: [],
      denylist: [{ serverName: 'bad-server' }],
    };
    assert.strictEqual(checkMcpPolicy('bad-server', {}, policy), 'denied');
  });

  it('denies by command match', () => {
    const policy = {
      allowlist: [],
      denylist: [{ serverCommand: ['python', 'evil.py'] }],
    };
    const config = { command: 'python', args: ['evil.py'] };
    assert.strictEqual(checkMcpPolicy('any', config, policy), 'denied');
  });

  it('denies by URL wildcard pattern', () => {
    const policy = {
      allowlist: [],
      denylist: [{ serverUrl: 'https://*.evil.com/*' }],
    };
    const config = { url: 'https://api.evil.com/mcp' };
    assert.strictEqual(checkMcpPolicy('any', config, policy), 'denied');
  });

  it('allows by URL pattern in allowlist', () => {
    const policy = {
      allowlist: [{ serverUrl: 'https://*.company.com/*' }],
      denylist: [],
    };
    const config = { url: 'https://api.company.com/mcp' };
    assert.strictEqual(checkMcpPolicy('any', config, policy), 'allowed');
  });

  it('allows by command match in allowlist', () => {
    const policy = {
      allowlist: [{ serverCommand: ['node', 'approved.js'] }],
      denylist: [],
    };
    const config = { command: 'node', args: ['approved.js'] };
    assert.strictEqual(checkMcpPolicy('any', config, policy), 'allowed');
  });

  it('URL pattern does not match different URL', () => {
    const policy = {
      allowlist: [],
      denylist: [{ serverUrl: 'https://evil.com/mcp' }],
    };
    const config = { url: 'https://good.com/mcp' };
    assert.strictEqual(checkMcpPolicy('any', config, policy), 'no-policy');
  });

  it('command match requires exact array match', () => {
    const policy = {
      allowlist: [],
      denylist: [{ serverCommand: ['node', 'evil.js'] }],
    };
    const config = { command: 'node', args: ['good.js'] };
    assert.strictEqual(checkMcpPolicy('any', config, policy), 'no-policy');
  });
});
