const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args:['--no-sandbox'] });
  const urls = process.argv.slice(2);
  for (const u of urls) {
    const ctx = await b.newContext({ locale:'en-CA', viewport:{width:1440,height:1200} });
    const p = await ctx.newPage();
    try {
      await p.goto(u, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await p.waitForTimeout(7000);
      const t = await p.evaluate(()=>document.body.innerText);
      console.log('\n\n########## '+u+'  (len '+t.length+')\n'+t);
    } catch(e){ console.log('\n\n########## '+u+' ERROR '+e.message); }
    await ctx.close();
  }
  await b.close();
})();
