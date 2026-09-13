const { chromium } = require('playwright');
process.chdir('/home/nicole/MyGithub/claude-code-organizer');
(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage();
  await p.setViewportSize({ width: 1400, height: 900 });
  await p.goto('http://localhost:3847', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3000);
  const hdr = await p.$('.s-scope-hdr[data-scope-id="-home-nicole-CompanyRepo-ai-security-control-plane"]');
  if (hdr) await hdr.click();
  await p.waitForTimeout(500);
  await p.click('#inheritToggleBtn');
  await p.waitForTimeout(500);
  const pills = await p.evaluate(() => {
    return Array.from(document.querySelectorAll('.f-pill[data-filter]')).map(el => ({
      cat: el.dataset.filter,
      dimmed: el.classList.contains('f-pill-dim'),
      title: el.title || '(no title)'
    }));
  });
  console.log(JSON.stringify(pills, null, 2));
  await b.close();
})();
