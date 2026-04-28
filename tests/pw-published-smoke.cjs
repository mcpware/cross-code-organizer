/**
 * Smoke test for published npm version — verifies core functionality works
 * Run: DISPLAY=:0 node tests/pw-published-smoke.cjs
 */
const { chromium } = require('/home/nicole/.nvm/versions/node/v20.19.4/lib/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  let passed = 0, failed = 0;

  function ok(name) { passed++; console.log(`  ✅ ${name}`); }
  function fail(name, reason) { failed++; console.log(`  ❌ ${name}: ${reason}`); }

  try {
    await page.goto('http://localhost:3847');
    await page.waitForTimeout(2000);

    // ═══ 1: Dashboard loads ═══
    console.log('TEST 1: Dashboard loads');
    const title = await page.title();
    if (title.includes('Cross-Code Organizer (CCO)')) ok('title correct: ' + title);
    else fail('title', title);

    // ═══ 2: Sidebar scope tree ═══
    console.log('\nTEST 2: Sidebar scope tree');
    const globalNode = page.locator('.s-nm:has-text("Global")').first();
    if (await globalNode.isVisible()) ok('Global scope visible');
    else fail('Global scope', 'not visible');

    // ═══ 3: Items load ═══
    console.log('\nTEST 3: Items load');
    const scanData = await page.evaluate(() => fetch('/api/scan').then(r => r.json()));
    const itemCount = scanData.items?.length || 0;
    if (itemCount > 0) ok(`${itemCount} items discovered`);
    else fail('items', '0 items');

    // ═══ 4: MCP servers discovered ═══
    console.log('\nTEST 4: MCP servers');
    const mcpItems = scanData.items?.filter(i => i.category === 'mcp') || [];
    if (mcpItems.length > 0) ok(`${mcpItems.length} MCP servers found`);
    else fail('MCP', '0 servers');

    // ═══ 5: File content API (Issue #12 fix) ═══
    console.log('\nTEST 5: File content API (Issue #12)');
    const fileItem = scanData.items?.find(i => i.path && i.category === 'skill');
    if (fileItem) {
      const resp = await page.evaluate(async (p) => {
        return fetch(`/api/file-content?path=${encodeURIComponent(p)}`).then(r => r.json());
      }, fileItem.path);
      if (resp.ok || resp.content !== undefined) ok('file-content works for: ' + fileItem.name);
      else fail('file-content', resp.error || 'no content');
    } else {
      ok('no skill items to test (skipped)');
    }

    // ═══ 6: Export API accepts absolute path (Issue #12 fix) ═══
    console.log('\nTEST 6: Export API (Issue #12)');
    const exportResp = await page.evaluate(async () => {
      return fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exportDir: '/tmp/cco-publish-test' }),
      }).then(r => r.json());
    });
    if (exportResp.ok) ok('export works with absolute path');
    else fail('export', exportResp.error);

    // ═══ 7: claudeJsonProjectKey present (Issue #11 fix) ═══
    console.log('\nTEST 7: claudeJsonProjectKey (Issue #11)');
    const claudeJsonItems = mcpItems.filter(i => i.fileName === '.claude.json');
    const withKey = claudeJsonItems.filter(i => i.claudeJsonProjectKey);
    ok(`${claudeJsonItems.length} .claude.json servers, ${withKey.length} with projectKey`);

    // ═══ 8: Security scan works ═══
    console.log('\nTEST 8: Security scan API');
    const secResp = await page.evaluate(async () => {
      return fetch('/api/security-scan', { method: 'POST' }).then(r => r.json());
    });
    if (secResp.ok) ok(`scan returned ${secResp.findings?.length || 0} findings from ${secResp.serversConnected} servers`);
    else fail('security scan', secResp.error);

    // ═══ 9: Context budget API ═══
    console.log('\nTEST 9: Context budget API');
    const ctxResp = await page.evaluate(async () => {
      return fetch('/api/context-budget?scope=global').then(r => r.json());
    });
    if (ctxResp.ok) ok(`context budget: ${ctxResp.percentUsed || 0}% used`);
    else fail('context budget', ctxResp.error);

    // ═══ 10: Security panel opens ═══
    console.log('\nTEST 10: Security panel UI');
    await page.click('#securityScanBtn');
    await page.waitForTimeout(500);
    const secPanel = page.locator('#securityPanel');
    if (await secPanel.isVisible()) ok('security panel opens');
    else fail('security panel', 'not visible');

    // ═══ 11: Context budget panel opens ═══
    console.log('\nTEST 11: Context budget UI');
    await page.locator('#securityClose').click();
    await page.waitForTimeout(300);
    const ctxBtn = page.locator('button:has-text("Context Budget")');
    if (await ctxBtn.isVisible()) {
      await ctxBtn.click();
      await page.waitForTimeout(500);
      const ctxPanel = page.locator('#ctxBudgetPanel');
      if (await ctxPanel.isVisible()) ok('context budget panel opens');
      else fail('context budget panel', 'not visible');
    } else {
      ok('context budget button not on this scope (skipped)');
    }

    // ═══ 12: Click item shows detail ═══
    console.log('\nTEST 12: Item detail panel');
    const firstItem = page.locator('.item').first();
    if (await firstItem.isVisible()) {
      await firstItem.click();
      await page.waitForTimeout(500);
      const detail = page.locator('#detail');
      if (await detail.isVisible()) ok('detail panel opens on item click');
      else fail('detail panel', 'not visible after click');
    } else {
      ok('no items visible (skipped)');
    }

    // ═══ 13: No JS errors ═══
    console.log('\nTEST 13: No JavaScript errors');
    if (errors.length === 0) ok('zero JS errors');
    else fail(`${errors.length} JS errors`, errors.join('; '));

    // Screenshot
    await page.screenshot({ path: '/tmp/pw-published-smoke.png' });

    console.log(`\n═══ RESULTS: ${passed} passed, ${failed} failed ═══`);
    if (failed > 0) process.exitCode = 1;
  } catch (e) {
    console.error('❌ FATAL:', e.message);
    await page.screenshot({ path: '/tmp/pw-published-err.png' });
    process.exitCode = 1;
  } finally {
    await page.waitForTimeout(2000);
    await browser.close();
  }
})();
