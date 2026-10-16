/* Browser-level smoke test for NEXUS-X Universal.
 * Non-destructive: serves the current checkout locally, uses a fresh temporary Chromium
 * profile, does not call GitHub production pages, and never updates app data in main.
 * Run after installing Playwright + its Chromium browser: node scripts/universal-browser-smoke.cjs
 */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const os=require('node:os');
const {chromium}=require('playwright');

const root=path.resolve(__dirname,'..');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'nexus-universal-browser-'));
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
 '.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8',
 '.webmanifest':'application/manifest+json','.css':'text/css; charset=utf-8',
 '.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp',
 '.woff2':'font/woff2','.wasm':'application/wasm'};
const errors=[];
let requests=0,context,server;

function respond(req,res){
 try{
  requests++;
  const url=new URL(req.url,'http://127.0.0.1');
  const prefix='/laboratorio-universal/';
  if(!url.pathname.startsWith(prefix)){res.writeHead(404).end();return;}
  const relative=decodeURIComponent(url.pathname.slice(prefix.length))||'index.html';
  const filename=path.resolve(root,relative);
  if(!filename.startsWith(root+path.sep)||!fs.existsSync(filename)||!fs.statSync(filename).isFile()){
   res.writeHead(404).end();return;
  }
  res.setHeader('Content-Type',MIME[path.extname(filename)]||'application/octet-stream');
  res.setHeader('Cache-Control','no-store');
  fs.createReadStream(filename).pipe(res);
 }catch(error){res.writeHead(400).end(String(error.message));}
}

function observe(page){
 page.on('pageerror',error=>errors.push(error.message));
}
async function ready(page,expected){
 await page.waitForFunction(expected=>{
  const inv=document.querySelector('#statInventory')?.textContent?.trim();
  const docs=document.querySelector('#taskDocs')?.textContent?.trim();
  const sys=document.querySelector('#statSystem')?.textContent?.trim();
  const scope='nexus-x-institutional:'+encodeURIComponent('/laboratorio-universal/')+':nexus_x_inventory_v1';
  return inv===String(expected)&&docs==='0'&&sys==='OK'&&localStorage.getItem(scope)!==null;
 },expected,{timeout:30000});
}

(async()=>{
 server=http.createServer(respond);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port+'/laboratorio-universal/';
 const launch=()=>chromium.launchPersistentContext(profile,{
  headless:true,
  viewport:{width:412,height:915},
  serviceWorkers:'allow'
 });
 context=await launch();
 let page=context.pages()[0]||await context.newPage();
 observe(page);
 await page.goto(base,{waitUntil:'domcontentloaded',timeout:30000});
 await ready(page,0);
 console.log('PASS real Chromium: universal empty boot (0 records, 0 documents)');

 await page.evaluate(()=>navigator.serviceWorker.ready);
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller,{timeout:20000}).catch(async()=>{
  await page.reload({waitUntil:'domcontentloaded'});
  await ready(page,0);
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller,{timeout:20000});
 });
 console.log('PASS real Chromium: application shell installed and controlled');

 // Use the genuine UI to create a disposable record in the isolated test profile.
 await page.locator('[data-view="inventory"]').click();
 await page.locator('#newItemBtn').click();
 await page.locator('#fId').fill('NEXUS-X-0001');
 await page.locator('#fName').fill('Material sintético de prueba');
 await page.locator('#fLocation').fill('Gabinete de prueba');
 await page.locator('#saveItemBtn').click();
 await ready(page,1);
 const key='nexus-x-institutional:'+encodeURIComponent('/laboratorio-universal/')+':nexus_x_inventory_v1';
 const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
 assert.equal(saved.length,1);
 assert.equal(saved[0].name,'Material sintético de prueba');
 console.log('PASS real Chromium: create record from UI, scoped browser storage');

 // Verify offline reload is actually served by the installed service worker.
 const beforeOffline=requests;
 await context.setOffline(true);
 await page.reload({waitUntil:'domcontentloaded',timeout:30000});
 await ready(page,1);
 assert.equal(await page.evaluate(()=>navigator.onLine),false);
 assert.equal(requests,beforeOffline,'the offline reload made unexpected origin requests');
 console.log('PASS real Chromium: offline page reload, persisted record and zero origin requests');

 // Cold Chromium process restart, still without network.
 await context.close();context=null;
 context=await launch();
 await context.setOffline(true);
 page=context.pages()[0]||await context.newPage();
 observe(page);
 const beforeCold=requests;
 await page.goto(base+'?offline-cold=1',{waitUntil:'domcontentloaded',timeout:30000});
 await ready(page,1);
 assert.equal(await page.evaluate(()=>navigator.onLine),false);
 assert.equal(requests,beforeCold,'the cold offline launch contacted the origin');
 console.log('PASS real Chromium: cold-process offline start with original record retained');

 assert.deepEqual(errors,[],'uncaught browser errors');
 console.log('PASS no uncaught page errors. PHYSICAL ANDROID STILL REQUIRES SEPARATE TESTING.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
 if(context)await context.close().catch(()=>{});
 if(server)await new Promise(resolve=>server.close(resolve));
 fs.rmSync(profile,{recursive:true,force:true});
});
