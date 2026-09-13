const { chromium } = require('playwright');
(async () => {
  const url = process.argv[2];
  const out = process.argv[3];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args:['--no-sandbox'] });
  const p = await b.newPage();
  const reqs = [];
  p.on('response', r => { const u=r.url(); if(/json|api|graphql/i.test(u)) reqs.push(r.status()+' '+u); });
  await p.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(e=>console.error('nav',e.message));
  await p.waitForTimeout(4000);
  const txt = await p.evaluate(() => document.body.innerText);
  require('fs').writeFileSync(out, txt);
  console.error('--- XHR ---'); reqs.forEach(r=>console.error(r));
  await b.close();
})();
