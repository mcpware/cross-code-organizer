/**
 * E2E tests for Issue #12 (Windows path validation) and Issue #11 (moveMcp project scope)
 * Run: cd claude-code-organizer && DISPLAY=:0 node tests/pw-windows-fix.cjs
 */
const { chromium } = require('/home/nicole/.nvm/versions/node/v20.19.4/lib/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  let passed = 0, failed = 0, skipped = 0;

  function ok(name) { passed++; console.log(`  ✅ ${name}`); }
  function fail(name, reason) { failed++; console.log(`  ❌ ${name}: ${reason}`); }
  function skip(name, reason) { skipped++; console.log(`  ⚠️ ${name}: ${reason}`); }

  try {
    await page.goto('http://localhost:3847');
    await page.waitForTimeout(2000);

    // Get scan data via API (avoids UI timing issues)
    const scanData = await page.evaluate(() => fetch('/api/scan').then(r => r.json()));

    // ═══ TEST 1: file-content API works with absolute paths ═══
    console.log('\nTEST 1: /api/file-content accepts absolute paths');
    const fileItem = scanData.items?.find(i => i.path && i.category !== 'session');
    if (fileItem) {
      const resp = await page.evaluate(async (p) => {
        const r = await fetch(`/api/file-content?path=${encodeURIComponent(p)}`);
        return r.json();
      }, fileItem.path);
      if (resp.ok || resp.content !== undefined) ok('file-content returns data for: ' + fileItem.path.split('/').pop());
      else if (resp.error?.includes('Invalid')) fail('file-content rejected valid path', resp.error);
      else ok('file-content responded (may be dir/binary): ' + (resp.error || '').slice(0, 50));
    } else skip('file-content', 'no items with paths');

    // ═══ TEST 2: export API accepts absolute path ═══
    console.log('\nTEST 2: /api/export validates absolute paths');
    const exportResp = await page.evaluate(async () => {
      return fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exportDir: '/tmp/cco-test-export' }),
      }).then(r => r.json());
    });
    if (exportResp.ok) ok('export accepted /tmp/cco-test-export');
    else if (exportResp.error?.includes('Invalid')) fail('export rejected valid absolute path', exportResp.error);
    else ok('export responded: ' + (exportResp.error || exportResp.message || '').slice(0, 50));

    // ═══ TEST 3: export API rejects relative path ═══
    console.log('\nTEST 3: /api/export rejects relative paths');
    const relResp = await page.evaluate(async () => {
      return fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exportDir: 'relative/path' }),
      }).then(r => r.json());
    });
    if (!relResp.ok) ok('export correctly rejected relative path');
    else fail('export accepted relative path (should reject)', '');

    // ═══ TEST 4: Scanner discovers .claude.json servers with projectKey ═══
    console.log('\nTEST 4: Scanner includes claudeJsonProjectKey');
    const mcpItems = scanData.items?.filter(i => i.category === 'mcp') || [];
    const claudeJsonItems = mcpItems.filter(i => i.fileName === '.claude.json');
    const withProjectKey = claudeJsonItems.filter(i => i.claudeJsonProjectKey);

    console.log(`  MCP items: ${mcpItems.length}, from .claude.json: ${claudeJsonItems.length}, with projectKey: ${withProjectKey.length}`);
    if (claudeJsonItems.length > 0) ok(`found ${claudeJsonItems.length} .claude.json servers`);
    else skip('claudeJson servers', 'no .claude.json MCP servers found');

    if (withProjectKey.length > 0) {
      for (const item of withProjectKey) {
        console.log(`    ${item.name} → projectKey: ${item.claudeJsonProjectKey.slice(-40)}`);
      }
      ok(`${withProjectKey.length} servers have claudeJsonProjectKey`);
    } else {
      skip('claudeJsonProjectKey', 'no project-scope servers in .claude.json (need `claude mcp add --scope project`)');
    }

    // ═══ TEST 5: No duplicate MCP server from same file ═══
    console.log('\nTEST 5: No duplicate MCP servers (same scope + same file)');
    const seen = new Set();
    let dupes = 0;
    for (const item of mcpItems) {
      // Dupes across DIFFERENT files (e.g. .mcp.json vs .claude.json) are user config issues, not bugs
      const key = `${item.scopeId}::${item.name}::${item.path}`;
      if (seen.has(key)) { dupes++; console.log(`  DUPE: ${item.name} in ${item.scopeId} (${item.path})`); }
      seen.add(key);
    }
    if (dupes === 0) ok('no duplicates from same file');
    else fail(`${dupes} duplicate MCP servers from same file`, '');

    // ═══ TEST 6: No JS errors ═══
    console.log('\nTEST 6: No JavaScript errors');
    if (errors.length === 0) ok('zero JS errors');
    else fail(`${errors.length} JS errors`, errors.join('; '));

    // Summary
    await page.screenshot({ path: '/tmp/pw-windows-fix.png' });
    console.log(`\n═══ RESULTS: ${passed} passed, ${failed} failed, ${skipped} skipped ═══`);
    if (failed > 0) process.exitCode = 1;
  } catch (e) {
    console.error('❌ FATAL:', e.message);
    await page.screenshot({ path: '/tmp/pw-windows-fix-err.png' });
    process.exitCode = 1;
  } finally {
    await page.waitForTimeout(2000);
    await browser.close();
  }
})();
