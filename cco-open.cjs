const { chromium } = require('playwright');
process.chdir('/home/nicole/MyGithub/claude-code-organizer');
(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('http://localhost:3847', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  // Clear localStorage so scope notice shows
  await page.evaluate(() => localStorage.removeItem('cco-scope-notice-v1-dismissed'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/tmp/cco-v0111.png' });
  console.log('done');
  await new Promise(() => {}); // keep open
})();
