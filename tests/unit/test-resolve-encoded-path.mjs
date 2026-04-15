/**
 * Unit tests for resolveEncodedProjectPath in scanner.mjs.
 *
 * These tests verify the DFS-with-backtracking resolver correctly handles:
 *   - Normal paths (baseline)
 *   - Directory names containing underscores (encoded identically to hyphens)
 *   - Directory names containing hyphens (ambiguous segment boundaries)
 *   - Mixed underscore+hyphen paths that require backtracking
 *   - Non-existent encoded paths (should return null)
 *
 * Background (issue #17): Claude Code's path encoding replaces both `/` and `_`
 * with `-`, making the encoding lossy. The original greedy resolver failed to
 * match real directories like `My_Projects` against their encoded form `My-Projects`.
 * The DFS resolver lists actual filesystem entries and normalises both sides before
 * comparing, so underscore/hyphen ambiguity is resolved correctly.
 *
 * Run: node --test tests/unit/test-resolve-encoded-path.mjs
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveEncodedProjectPath } from '../../src/scanner.mjs';

// ── Helpers ────────────────────────────────────────────────────────

let BASE;

async function mkdirs(...parts) {
  const full = join(BASE, ...parts);
  await mkdir(full, { recursive: true });
  return full;
}

/**
 * Encode an absolute path the same way Claude Code does:
 * replace every `/` path separator AND every `_` underscore with `-`,
 * then prepend a leading `-` for the root separator.
 *
 * This lossy encoding is the root cause of issue #17: "My_Projects" and a
 * hypothetical "My-Projects" both encode to "My-Projects", making resolution
 * ambiguous without the DFS+normalisation approach.
 */
function encodeUnixPath(absolutePath) {
  return '-' + absolutePath.replace(/^\//, '').replace(/[/_]/g, '-');
}

// ── Fixtures ───────────────────────────────────────────────────────

before(async () => {
  BASE = join(tmpdir(), `cco-test-resolve-${process.pid}`);
  await mkdir(BASE, { recursive: true });

  // 1. Simple flat project
  await mkdirs('simple');

  // 2. Nested project (two levels deep)
  await mkdirs('parent', 'child');

  // 3. Underscore in directory name  →  encoded form uses hyphen
  await mkdirs('My_Projects', 'repo');

  // 4. Hyphen in directory name  →  ambiguous boundary
  await mkdirs('my-org', 'project');

  // 5. Mixed: underscore + hyphen at different levels
  await mkdirs('core_repos', 'my-tool');

  // 6. Deep path with underscore mid-segment
  await mkdirs('work', 'Parent_Dir', 'my-repo');
});

after(async () => {
  await rm(BASE, { recursive: true, force: true });
});

// ── Tests ──────────────────────────────────────────────────────────

describe('resolveEncodedProjectPath — baseline (no underscores or hyphens)', () => {

  it('resolves a simple single-level project', async () => {
    const target = join(BASE, 'simple');
    const encoded = encodeUnixPath(target);
    const result = await resolveEncodedProjectPath(encoded);
    assert.strictEqual(result, target);
  });

  it('resolves a nested two-level project', async () => {
    const target = join(BASE, 'parent', 'child');
    const encoded = encodeUnixPath(target);
    const result = await resolveEncodedProjectPath(encoded);
    assert.strictEqual(result, target);
  });

  it('returns null for a path that does not exist', async () => {
    const encoded = encodeUnixPath(join(BASE, 'nonexistent', 'path'));
    const result = await resolveEncodedProjectPath(encoded);
    assert.strictEqual(result, null);
  });
});

describe('resolveEncodedProjectPath — underscore in directory names (issue #17 case 1)', () => {

  it('resolves a directory whose name contains an underscore', async () => {
    // "My_Projects" is encoded as "My-Projects" — same as a dir literally named "My-Projects"
    const target = join(BASE, 'My_Projects', 'repo');
    const encoded = encodeUnixPath(join(BASE, 'My_Projects', 'repo'));
    const result = await resolveEncodedProjectPath(encoded);
    assert.strictEqual(result, target);
  });

  it('resolves deep path with underscore mid-level (Parent_Dir)', async () => {
    const target = join(BASE, 'work', 'Parent_Dir', 'my-repo');
    const encoded = encodeUnixPath(target);
    const result = await resolveEncodedProjectPath(encoded);
    assert.strictEqual(result, target);
  });
});

describe('resolveEncodedProjectPath — hyphen in directory names (issue #17 case 2)', () => {

  it('resolves a directory whose name contains a hyphen', async () => {
    const target = join(BASE, 'my-org', 'project');
    const encoded = encodeUnixPath(target);
    const result = await resolveEncodedProjectPath(encoded);
    assert.strictEqual(result, target);
  });
});

describe('resolveEncodedProjectPath — mixed underscore + hyphen (backtracking required)', () => {

  it('resolves path with both underscore and hyphen across levels', async () => {
    // core_repos/my-tool: encoded as …-core-repos-my-tool
    // The greedy resolver would dead-end trying to match "core-repos-my-tool" as one dir.
    const target = join(BASE, 'core_repos', 'my-tool');
    const encoded = encodeUnixPath(target);
    const result = await resolveEncodedProjectPath(encoded);
    assert.strictEqual(result, target);
  });

  it('returns null when no combination of segments matches real directories', async () => {
    const encoded = encodeUnixPath(join(BASE, 'does_not', 'exist_at_all'));
    const result = await resolveEncodedProjectPath(encoded);
    assert.strictEqual(result, null);
  });
});
