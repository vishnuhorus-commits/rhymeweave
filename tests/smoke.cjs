const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
(async () => {
 const server = http.createServer(async(req,res)=>{
  try {const pathname = new URL(req.url,'http://localhost').pathname;
   const file=path.join(root,pathname==='/'?'index.html':pathname);
   if(!file.startsWith(root+path.sep))throw Error();
   const data=await fs.readFile(file);
   const types={'.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png'};
   res.writeHead(200,{'Content-Type':types[path.extname(file)]||'text/plain'});res.end(data);
  }catch{res.writeHead(404);res.end('Not found')}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;
 try {
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({acceptDownloads:true});const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',d=>d.dismiss());
  await page.goto('http://127.0.0.1:'+server.address().port+'/');
  await page.waitForFunction(()=>document.getElementById('offlineStatus').textContent.startsWith('Offline shell ready'));
  await page.getByRole('button',{name:/Creative Studio/}).click();
  await page.getByRole('button',{name:'Review Sorter',exact:true}).click();
  const input='Silver stars shine.\nSILVER   STARS SHINE!\nTwo words\nSolitary\n\n!!!\nAmber angels ascend\nDON’T STOP\nCafé circles carry\n';
  await page.locator('#reviewInput').fill(input);await page.locator('#sortButton').click();
  assert.equal(await page.locator('#approvedOut').textContent(),'AMBER ANGELS ASCEND\nSILVER STARS SHINE');
  assert.equal(await page.locator('#reviewInput').inputValue(),input);
  assert.match(await page.locator('#reviewStatus').textContent(),/9 input lines · 2 clean · 7 review \(including 1 duplicates\)/);
  const expectations=[['Download clean A–Z','AMBER ANGELS ASCEND\nSILVER STARS SHINE'],['Download review — not deleted','TWO_WORDS'],['Download duplicates','DUPLICATE'],['Download source text copy',input],['Download process log','"accountingPassed": true']];
  for(const [name,expected] of expectations){const pending=page.waitForEvent('download');await page.getByRole('button',{name,exact:true}).click();const d=await pending;const text=await fs.readFile(await d.path(),'utf8');assert.ok(text.includes(expected),name);}
  await page.locator('#reviewInput').fill('Bright birds bloom');assert.equal(await page.locator('.reviewExport:enabled').count(),0);
  await page.locator('#reviewFile').setInputFiles({name:'sample.txt',mimeType:'text/plain',buffer:Buffer.from('Zealous zebras zoom\r\nAmber angels ascend')});
  await page.waitForFunction(()=>document.getElementById('reviewStatus').textContent.startsWith('Loaded sample.txt'));
  await page.locator('#sortButton').click();assert.equal(await page.locator('#approvedOut').textContent(),'AMBER ANGELS ASCEND\nZEALOUS ZEBRAS ZOOM');
  const scale=await page.evaluate(()=>{const lines=Array.from({length:1100},(_,i)=>'ALPHA BETA '+String.fromCharCode(65+Math.floor(i/676),65+Math.floor(i/26)%26,65+i%26));const r=processReview(lines.concat(lines).join('\n'),'scale');return {clean:r.clean.length,duplicates:r.duplicates.length,held:r.held.length,total:r.inputLines};});
  assert.deepEqual(scale,{clean:1100,duplicates:1100,held:1100,total:2200});
  await page.getByRole('button',{name:'← Grand Hall'}).click();await page.getByRole('button',{name:/Universal Knowledge Search/}).click();assert.ok(await page.getByRole('button',{name:'Search — not available yet'}).isDisabled());
  await page.getByRole('button',{name:'← Grand Hall'}).click();
  await page.getByRole('button',{name:/Language Wing/}).click();
  await page.locator('#dbFile').setInputFiles({name:'test.jsonl',mimeType:'text/plain',buffer:Buffer.from('{"word":"flame","rhyme_key":"EY1 M"}\n{"word":"game","rhyme_key":"EY1 M"}')});
  await page.getByRole('button',{name:'Load Database',exact:true}).click();await page.locator('#wordInput').fill('flame');await page.getByRole('button',{name:'Find Rhymes',exact:true}).click();assert.match(await page.locator('#finderOut').textContent(),/game/);
  await page.getByRole('button',{name:'← Grand Hall'}).click();await page.getByRole('button',{name:/Creative Studio/}).click();await page.locator('#pmTheme').fill('Golden garden');await page.getByRole('button',{name:'Generate Prompt',exact:true}).click();assert.match(await page.locator('#pmPositive').inputValue(),/Golden garden/);
  await page.evaluate(async()=>{await caches.open('another-app-cache');await caches.open('rhymeweave-obsolete')});
  // Verify offline shell and sorter, not just registration.
  await context.setOffline(true);await page.reload();await page.waitForSelector('#home');
  await page.getByRole('button',{name:/Creative Studio/}).click();await page.getByRole('button',{name:'Review Sorter',exact:true}).click();await page.locator('#reviewInput').fill('Bold birds bloom\nTwo words');await page.locator('#sortButton').click();assert.equal(await page.locator('#approvedOut').textContent(),'BOLD BIRDS BLOOM');
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  await page.screenshot({path:process.env.QA_SCREENSHOT||'/tmp/rhymeweave-sorter.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS: sorting, duplicate and short-line preservation, all five downloads, stale export protection, file intake, 2200-line batch, rhyme and prompt regressions, disabled search, offline reload, mobile width; no page errors.');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
