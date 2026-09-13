const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage();
  await p.setViewportSize({ width: 1400, height: 900 });
  await p.goto('http://localhost:3847', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(4000);

  // Select ai-security-control-plane
  const hdr = await p.$('.s-scope-hdr[data-scope-id="-home-nicole-CompanyRepo-ai-security-control-plane"]');
  if (hdr) await hdr.click();
  await p.waitForTimeout(800);

  // 1. Test Show Effective
  const beforeCount = await p.evaluate(() => document.querySelectorAll('.item').length);
  await p.click('#inheritToggleBtn');
  await p.waitForTimeout(1000);
  const afterCount = await p.evaluate(() => document.querySelectorAll('.item').length);
  console.log(`Show Effective: ${beforeCount} → ${afterCount} items (+${afterCount - beforeCount})`);

  // Check Ancestor badges
  const ancestors = await p.evaluate(() =>
    Array.from(document.querySelectorAll('.ib-ancestor')).map(el =>
      el.closest('.item')?.querySelector('.item-name')?.textContent
    ).filter(Boolean)
  );
  console.log('Ancestor badges:', ancestors.length > 0 ? ancestors : '(none — expected if no ancestor scopes)');

  // 2. Test "Why it applies" in detail panel
  const firstItem = await p.$('.item');
  if (firstItem) {
    await firstItem.click();
    await p.waitForTimeout(500);
    const whyVisible = await p.evaluate(() => {
      const el = document.getElementById('detailEffective');
      return el && !el.classList.contains('hidden');
    });
    const whyText = await p.evaluate(() =>
      document.getElementById('detailEffectiveText')?.textContent || '(empty)'
    );
    console.log(`Why it applies visible: ${whyVisible}`);
    console.log(`Why text: ${whyText.substring(0, 80)}`);
  }

  // 3. Test tree view toggle
  const treeBtn = await p.$('#treeViewBtn');
  if (treeBtn) {
    await treeBtn.click();
    await p.waitForTimeout(500);
    // Check if CompanyRepo has children nested under it
    const hasNestedChildren = await p.evaluate(() => {
      const companyScope = document.querySelector('.s-scope[data-scope-id="-home-nicole-CompanyRepo"]');
      if (!companyScope) return false;
      return companyScope.querySelectorAll('.s-scope').length > 0;
    });
    console.log(`Tree view: CompanyRepo has nested children: ${hasNestedChildren}`);
    await p.screenshot({ path: '/tmp/cco-tree-view.png' });
    console.log('Tree view screenshot saved');
  }

  // 4. Check dimmed pills tooltip
  const dimmedPills = await p.evaluate(() =>
    Array.from(document.querySelectorAll('.f-pill.f-pill-dim')).map(el => ({
      cat: el.dataset.filter,
      title: el.title
    }))
  );
  console.log('Dimmed pills:', dimmedPills);

  await b.close();
})();
