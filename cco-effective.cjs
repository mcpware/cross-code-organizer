const { chromium } = require('playwright');
process.chdir('/home/nicole/MyGithub/claude-code-organizer');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('http://localhost:3847', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  // Click ai-security-control-plane
  const hdr = await page.$('.s-scope-hdr[data-scope-id="-home-nicole-CompanyRepo-ai-security-control-plane"]');
  if (hdr) { await hdr.click(); await page.waitForTimeout(1000); }

  // Screenshot before Show Effective
  await page.screenshot({ path: '/tmp/cco-before-effective.png' });
  console.log('before saved');

  // Click Show Effective
  await page.click('#inheritToggleBtn');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/cco-after-effective.png' });
  console.log('after saved');

  // Hover over MCP pill to see tooltip
  const mcpPill = await page.$('.f-pill[data-filter="mcp"]');
  if (mcpPill) {
    await mcpPill.hover();
    await page.waitForTimeout(500);
    await page.screenshot({ path: '/tmp/cco-mcp-pill.png' });
    console.log('mcp pill saved');
  }

  await browser.close();
})();
