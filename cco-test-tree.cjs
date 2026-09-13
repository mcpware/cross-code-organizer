const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage();
  await p.setViewportSize({ width: 1400, height: 900 });
  await p.goto('http://localhost:3847', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(4000);
  const toggle = await p.evaluate(() => {
    const el = document.getElementById('treeViewToggle');
    return el ? { text: el.textContent.trim(), parent: el.closest('.s-scope-hdr')?.dataset?.scopeId } : null;
  });
  console.log('Tree toggle:', toggle);
  if (toggle) {
    await p.click('#treeViewToggle');
    await p.waitForTimeout(500);
    const nested = await p.evaluate(() => {
      const cp = document.querySelector('.s-scope[data-scope-id="-home-nicole-CompanyRepo"]');
      return cp ? cp.querySelectorAll('.s-scope').length : 0;
    });
    console.log('CompanyRepo nested children:', nested);
    await p.screenshot({ path: '/tmp/cco-tree-toggle.png' });
    console.log('screenshot saved');
  }
  await b.close();
})();
