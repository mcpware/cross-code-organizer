const { chromium } = require('playwright');
process.chdir('/home/nicole/MyGithub/claude-code-organizer');
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

  // Count items BEFORE Show Effective
  const beforeCount = await p.evaluate(() => document.querySelectorAll('.item').length);
  const beforeSkills = await p.evaluate(() =>
    Array.from(document.querySelectorAll('.item')).filter(el =>
      el.closest('[data-cat-section="skill"]')
    ).length
  );
  console.log('BEFORE Show Effective:');
  console.log('  total items:', beforeCount);
  console.log('  skills:', beforeSkills);

  // Click Show Effective
  await p.click('#inheritToggleBtn');
  await p.waitForTimeout(1000);

  // Count items AFTER
  const afterCount = await p.evaluate(() => document.querySelectorAll('.item').length);
  const afterSkills = await p.evaluate(() =>
    Array.from(document.querySelectorAll('.item')).filter(el =>
      el.closest('[data-cat-section="skill"]')
    ).length
  );

  // Check for Global badges
  const globalBadges = await p.evaluate(() =>
    Array.from(document.querySelectorAll('.ib-global')).map(el =>
      el.closest('.item')?.querySelector('.item-name')?.textContent
    ).filter(Boolean)
  );

  // Check for Shadowed badges
  const shadowedBadges = await p.evaluate(() =>
    Array.from(document.querySelectorAll('.ib-shadowed')).map(el =>
      el.closest('.item')?.querySelector('.item-name')?.textContent
    ).filter(Boolean)
  );

  // Check for Conflict badges
  const conflictBadges = await p.evaluate(() =>
    Array.from(document.querySelectorAll('.ib-conflict')).map(el =>
      el.closest('.item')?.querySelector('.item-name')?.textContent
    ).filter(Boolean)
  );

  console.log('\nAFTER Show Effective:');
  console.log('  total items:', afterCount);
  console.log('  skills:', afterSkills);
  console.log('  items added:', afterCount - beforeCount);
  console.log('  Global badges:', globalBadges.slice(0, 5));
  console.log('  Shadowed badges:', shadowedBadges);
  console.log('  Conflict badges:', conflictBadges);

  // Also check MCP section specifically
  const mcpBefore = await p.evaluate(() => {
    // go back to before state - actually let's just check current
    return Array.from(document.querySelectorAll('[data-cat-section="mcp"] .item')).map(el => ({
      name: el.querySelector('.item-name')?.textContent,
      badges: Array.from(el.querySelectorAll('.item-badge')).map(b => b.textContent)
    }));
  });
  console.log('\nMCP items after effective:', JSON.stringify(mcpBefore.slice(0, 6), null, 2));

  await b.close();
})();
