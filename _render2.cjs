const { chromium } = require('playwright');
(async () => {
  const url = process.argv[2], out = process.argv[3];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args:['--no-sandbox'] });
  const p = await b.newPage();
  p.on('response', r => console.error(r.status()+' '+r.url()));
  const resp = await p.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(e=>{console.error('nav',e.message);return null;});
  if (resp) console.error('STATUS', resp.status(), 'FINAL', p.url());
  await p.waitForTimeout(6000);
  require('fs').writeFileSync(out, await p.evaluate(()=>document.body.innerText));
  console.error('LEN', (await p.evaluate(()=>document.body.innerText)).length);
  await b.close();
})();
