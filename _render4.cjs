const { chromium } = require('playwright');
(async () => {
  const url = process.argv[2];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args:['--no-sandbox'] });
  const ctx = await b.newContext({ locale:'en-CA', viewport:{width:1440,height:900} });
  const p = await ctx.newPage();
  p.on('console', m => console.error('CONSOLE', m.type(), m.text().slice(0,300)));
  p.on('pageerror', e => console.error('PAGEERR', e.message.slice(0,300)));
  p.on('request', r => { if(r.method()==='POST') console.error('POST', r.url().slice(0,200)); });
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(e=>console.error('nav',e.message));
  await p.waitForTimeout(12000);
  const t = await p.evaluate(()=>document.body.innerText);
  console.error('LEN', t.length);
  await b.close();
})();
