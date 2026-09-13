const { chromium } = require('playwright');
(async () => {
  const url = process.argv[2], out = process.argv[3];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args:['--no-sandbox'] });
  const ctx = await b.newContext({ locale:'en-CA' });
  const p = await ctx.newPage();
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(e=>console.error('nav',e.message));
  try { await p.click('text=Agree', { timeout: 5000 }); } catch(e){ console.error('no agree btn'); }
  await p.waitForTimeout(10000);
  const t = await p.evaluate(()=>document.body.innerText);
  require('fs').writeFileSync(out, t);
  console.error('FINAL', p.url(), 'LEN', t.length);
  await b.close();
})();
