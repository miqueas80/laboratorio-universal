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
const {chromium,devices}=require('playwright');

// NEXUS_SMOKE_ROOT switches the same full Chromium suite from the Git checkout
// to an extracted distribution. CI must verify the exact package schools receive.
const root=process.env.NEXUS_SMOKE_ROOT?
 fs.realpathSync(process.env.NEXUS_SMOKE_ROOT):path.resolve(__dirname,'..');
if(!fs.existsSync(path.join(root,'index.html'))||
   !fs.existsSync(path.join(root,'sw.js'))||
   !fs.existsSync(path.join(root,'backup-restore.js')))
 throw new Error('Smoke-test root is missing required Universal production assets');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'nexus-universal-browser-'));
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
 '.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8',
 '.webmanifest':'application/manifest+json','.css':'text/css; charset=utf-8',
 '.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp',
 '.woff2':'font/woff2','.wasm':'application/wasm'};
const errors=[];
let requests=0,context,server,restoreBrowser;

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
 page.on('console',message=>{if(message.type()==='error')console.error('BROWSER CONSOLE:',message.text().slice(0,400));});
 page.on('response',response=>{if(response.status()>=400)console.error('HTTP',response.status(),response.url());});
}
async function ready(page,expected,expectedDocs=0){
 try{
  await page.waitForFunction(({expected,expectedDocs})=>{
   const inv=document.querySelector('#statInventory')?.textContent?.trim();
   const docs=document.querySelector('#taskDocs')?.textContent?.trim();
   const sys=document.querySelector('#statSystem')?.textContent?.trim();
   const scope='nexus-x-institutional:'+encodeURIComponent('/laboratorio-universal/')+':nexus_x_inventory_v1';
   return inv===String(expected)&&docs===String(expectedDocs)&&sys==='OK'&&localStorage.getItem(scope)!==null;
  },{expected,expectedDocs},{timeout:15000});
 }catch(error){
  const snapshot=await page.evaluate(()=>({
   href:location.href,readyState:document.readyState,
   inventory:document.querySelector('#statInventory')?.textContent,
   docs:document.querySelector('#taskDocs')?.textContent,
   system:document.querySelector('#statSystem')?.textContent,
   repo:document.querySelector('#repoStatus')?.textContent,
   storageEntries:Object.keys(localStorage).filter(k=>k.includes('nexus')).map(k=>({key:k,value:localStorage.getItem(k)?.slice(0,120)})).slice(0,14),
   diagnostics:document.querySelector('#settingsDiag')?.textContent?.slice(0,1200)
  })).catch(e=>({snapshotError:e.message}));
  console.error('BROWSER BOOT DIAGNOSTIC:',JSON.stringify({snapshot,errors}));
  throw error;
 }
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
 // Create a synthetic binary original in the real IndexedDB document store.
 // No institution records are used and all artifacts remain in the temporary profile.
 await page.evaluate(async()=>{
  const scope=encodeURIComponent(new URL('./',location.href).pathname);
  const name='NEXUS_X_INSTITUTIONAL_DOCUMENTS_V1_'+scope;
  const db=await new Promise((resolve,reject)=>{
   const req=indexedDB.open(name,3);
   req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
  try{
   await new Promise((resolve,reject)=>{
    const tx=db.transaction('documents','readwrite');
    const contents='%PDF-1.4\nSynthetic offline backup fixture NEXUS-X-0001\n';
    const blob=new Blob([contents],{type:'application/pdf'});
    tx.objectStore('documents').put({
     path:'local:synthetic-backup.pdf',name:'synthetic-backup.pdf',type:'PDF',
     text:'Synthetic offline backup fixture NEXUS-X-0001',size:blob.size,
     source:'archivo local',chunks:['Synthetic offline backup fixture'],relations:[],
     indexedAt:'2026-10-15T00:00:00Z',mime:'application/pdf',blob
    });
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
    tx.onabort=()=>reject(tx.error);
   });
  }finally{db.close();}
 });
 await page.locator('[data-view="settings"]').click();
 const [backupDownload]=await Promise.all([
  page.waitForEvent('download',{timeout:30000}),
  page.locator('#institutionalBackupBtn').click()
 ]);
 assert.match(backupDownload.suggestedFilename(),/^NEXUS-X-respaldo-\d{4}-\d{2}-\d{2}\.zip$/);
 const archiveBytes=fs.readFileSync(await backupDownload.path());
 const backupResult=await page.evaluate(async(bytes)=>{
  const zip=await JSZip.loadAsync(new Uint8Array(bytes));
  const json=await zip.file('nexus-x-data.json').async('text');
  const data=JSON.parse(json),proof=JSON.parse(await zip.file('nexus-x-integrity.json').async('text'));
  const hex=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))]
   .map(n=>n.toString(16).padStart(2,'0')).join('');
  const original=data.documents.find(d=>d.path==='local:synthetic-backup.pdf');
  const bin=await zip.file(original.original.archivePath).async('uint8array');
  return {
   manifestHash:proof.dataSha256===await hex(new TextEncoder().encode(json)),
   originalHash:original.original.sha256===await hex(bin),
   format:data.format,
   inventory:data.inventory.length,
   originalContents:new TextDecoder().decode(bin),
   originals:proof.originals,
   hasSecrets:Object.keys(data).some(k=>/token|secret|apikey/i.test(k))
  };
 },[...archiveBytes]);
 assert.equal(backupResult.format,'nexus-x-institutional-backup');
 assert.equal(backupResult.inventory,1);
 assert.equal(backupResult.originals,1);
 assert.equal(backupResult.manifestHash,true);
 assert.equal(backupResult.originalHash,true);
 assert.equal(backupResult.hasSecrets,false);
 assert.match(backupResult.originalContents,/Synthetic offline backup fixture/);
 assert.equal(saved[0].id,'NEXUS-X-0001');
 console.log('PASS real Chromium: downloaded ZIP contains inventory + original document verified by SHA-256');
 // Round-trip audit: verify a genuine exported backup through the new read-only UI.
 const currentInventoryRaw=await page.evaluate(key=>localStorage.getItem(key),key);
 await page.locator('#backupZipInput').setInputFiles({
  name:'real-backup.zip',mimeType:'application/zip',buffer:archiveBytes
 });
 await page.waitForFunction(()=>document.querySelector('#backupInspection')?.textContent?.startsWith('✓ Respaldo válido'),
  null,{timeout:30000});
 const preview=await page.locator('#backupInspection').textContent();
 assert.match(preview,/Inventario: 1 registros/);
 assert.match(preview,/Originales verificados: 1/);
 assert.match(preview,/SOLO LECTURA/);
 assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),currentInventoryRaw);
 console.log('PASS real Chromium: UI verifies exported ZIP in read-only mode');
 // Tamper with the JSON while keeping the original checksum; verification must reject it.
 const forged=await page.evaluate(async(bytes)=>{
  const zip=await JSZip.loadAsync(new Uint8Array(bytes));
  const data=JSON.parse(await zip.file('nexus-x-data.json').async('text'));
  data.inventory[0].name='Archivo adulterado';
  zip.file('nexus-x-data.json',JSON.stringify(data));
  return [...await zip.generateAsync({type:'uint8array',compression:'DEFLATE'})];
 },[...archiveBytes]);
 await page.locator('#backupZipInput').setInputFiles({
  name:'tampered-backup.zip',mimeType:'application/zip',buffer:Buffer.from(forged)
 });
 await page.waitForFunction(()=>document.querySelector('#backupInspection')?.textContent?.startsWith('Respaldo NO válido'),
  null,{timeout:30000});
 const warning=await page.locator('#backupInspection').textContent();
 assert.match(warning,/SHA-256/);
 assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),currentInventoryRaw);
 console.log('PASS real Chromium: tampered ZIP rejected without touching inventory');



 // Verify offline reload is actually served by the installed service worker.
 const beforeOffline=requests;
 await context.setOffline(true);
 await page.reload({waitUntil:'domcontentloaded',timeout:30000});
 await ready(page,1,1);
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
 await ready(page,1,1);
 assert.equal(await page.evaluate(()=>navigator.onLine),false);
 assert.equal(requests,beforeCold,'the cold offline launch contacted the origin');
 console.log('PASS real Chromium: cold-process offline start with original record retained');

 // Synthetic medium-size inventory: browser-only performance probe, after all persistence tests.
 // Nothing is committed or uploaded; the temporary profile is deleted in finally.
 const syntheticSize=1000;
 await page.evaluate(({key,count})=>{
  const original=JSON.parse(localStorage.getItem(key))[0];
  const records=Array.from({length:count},(_,i)=>({
   ...original,record:i+1,id:'NEXUS-X-'+String(i+1).padStart(4,'0'),
   name:'Material simulado '+String(i+1).padStart(4,'0')
  }));
  localStorage.setItem(key,JSON.stringify(records));
 },{key,count:syntheticSize});
 const perfRequests=requests;
 await page.reload({waitUntil:'domcontentloaded',timeout:30000});
 await ready(page,syntheticSize,1);
 const metrics=await page.evaluate(()=>{
  const nav=performance.getEntriesByType('navigation')[0];
  const bootReadyMs=Math.round(performance.now());
  const before=performance.now();
  document.querySelector('[data-view="inventory"]').click();
  const inventoryRenderMs=performance.now()-before;
  const rows=document.querySelectorAll('#inventoryTable tbody tr').length;
  const input=document.querySelector('#inventorySearch');
  input.value='Material simulado 0900';
  const searching=performance.now();
  input.dispatchEvent(new Event('input',{bubbles:true}));
  const searchMs=performance.now()-searching;
  const filteredRows=document.querySelectorAll('#inventoryTable tbody tr').length;
  return {
   bootReadyMs,
   domContentLoadedMs:Math.round(nav?.domContentLoadedEventEnd||0),
   inventoryRenderMs:Math.round(inventoryRenderMs*10)/10,
   searchMs:Math.round(searchMs*10)/10,
   rows,filteredRows,
   usedJSHeapMB:typeof performance.memory?.usedJSHeapSize==='number'
    ?Math.round(performance.memory.usedJSHeapSize/1048576):null
  };
 });
 assert.equal(metrics.rows,syntheticSize);
 assert.equal(metrics.filteredRows,1);
 assert.equal(requests,perfRequests,'synthetic offline performance test contacted the origin');
 assert.ok(metrics.bootReadyMs<20000,'1000-row offline boot exceeded smoke-test safety limit');
 console.log('PERFORMANCE synthetic Chromium 1000 records:',JSON.stringify(metrics));
 console.log('PASS real Chromium: 1000-record offline startup, rendering and search');
 // Separate clean Chromium profile: restoration must refuse overwrites and work offline.
 restoreBrowser=await chromium.launch({headless:true});
 const freshContext=await restoreBrowser.newContext({
  viewport:{width:412,height:915},serviceWorkers:'allow'
 });
 const fresh=await freshContext.newPage();observe(fresh);
 await fresh.goto(base,{waitUntil:'domcontentloaded',timeout:30000});
 await ready(fresh,0);
 await fresh.evaluate(()=>navigator.serviceWorker.ready);
 await fresh.waitForFunction(()=>!!navigator.serviceWorker.controller,{timeout:20000})
  .catch(async()=>{await fresh.reload({waitUntil:'domcontentloaded'});await ready(fresh,0);
   await fresh.waitForFunction(()=>!!navigator.serviceWorker.controller,{timeout:20000})});
 await freshContext.setOffline(true);
 await fresh.locator('[data-view="settings"]').click();
 await fresh.locator('#backupZipInput').setInputFiles({
  name:'verified-school-backup.zip',mimeType:'application/zip',buffer:archiveBytes
 });
 await fresh.waitForFunction(()=>document.querySelector('#restoreEmptyBackupBtn')?.disabled===false,
  null,{timeout:30000});
 fresh.on('dialog',dialog=>dialog.accept(dialog.type()==='prompt'?'RESTAURAR':undefined));
 await fresh.locator('#restoreEmptyBackupBtn').click();
 await ready(fresh,1,1);
 const recovered=await fresh.evaluate(async()=>{
  const scope=encodeURIComponent(new URL('./',location.href).pathname);
  const db=await new Promise((resolve,reject)=>{
   const request=indexedDB.open('NEXUS_X_INSTITUTIONAL_DOCUMENTS_V1_'+scope,3);
   request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
  try{
   const doc=await new Promise((resolve,reject)=>{
    const tx=db.transaction('documents','readonly');
    const req=tx.objectStore('documents').get('local:synthetic-backup.pdf');
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
   });
   return {text:await doc.blob.text(),bytes:doc.blob.size};
  }finally{db.close()}
 });
 assert.match(recovered.text,/Synthetic offline backup fixture NEXUS-X-0001/);
 assert.ok(recovered.bytes>0);
 console.log('PASS real Chromium: verified institutional ZIP restores into EMPTY origin while offline');
 // A populated institution must never expose an enabled restore action.
 await fresh.locator('#backupZipInput').setInputFiles({
  name:'same-backup.zip',mimeType:'application/zip',buffer:archiveBytes
 });
 await fresh.waitForFunction(()=>document.querySelector('#backupInspection')?.textContent?.startsWith('✓ Respaldo válido'),
  null,{timeout:30000});
 assert.equal(await fresh.locator('#restoreEmptyBackupBtn').isDisabled(),true);
 await fresh.reload({waitUntil:'domcontentloaded',timeout:30000});
 await ready(fresh,1,1);
 assert.equal(await fresh.evaluate(()=>navigator.onLine),false);
 console.log('PASS real Chromium: recovered documents survive offline restart; overwrite disabled');
 // Mobile emulation exercises true touch semantics, not just a narrow desktop viewport.
 const androidProfile=devices['Pixel 7']||devices['Pixel 5'];
 assert.ok(androidProfile,'Playwright is missing an Android device profile');
 const phoneContext=await restoreBrowser.newContext({
  ...androidProfile,serviceWorkers:'allow',acceptDownloads:true
 });
 const phone=await phoneContext.newPage();observe(phone);
 await phone.goto(base,{waitUntil:'domcontentloaded',timeout:30000});
 await ready(phone,0);
 await phone.locator('[data-view="inventory"]').tap();
 await phone.locator('#newItemBtn').tap();
 await phone.locator('#fName').fill('Inventario táctil emulado');
 await phone.locator('#fLocation').fill('Laboratorio móvil');
 await phone.locator('#saveItemBtn').tap();
 await ready(phone,1);
 await phone.locator('[data-view="settings"]').tap();
 assert.equal(await phone.locator('#institutionalBackupBtn').isVisible(),true);
 await phone.evaluate(()=>navigator.serviceWorker.ready);
 await phone.waitForFunction(()=>!!navigator.serviceWorker.controller,{timeout:20000}).catch(async()=>{
  await phone.reload({waitUntil:'domcontentloaded'});await ready(phone,1);
  await phone.waitForFunction(()=>!!navigator.serviceWorker.controller,{timeout:20000});
 });
 await phoneContext.setOffline(true);
 await phone.reload({waitUntil:'domcontentloaded',timeout:30000});
 await ready(phone,1);
 assert.equal(await phone.evaluate(()=>navigator.onLine),false);
 console.log('PASS Chromium Android emulation: touch inventory, settings and offline reload');
 await phoneContext.close();

 await freshContext.close();await restoreBrowser.close();restoreBrowser=null;
 assert.deepEqual(errors,[],'uncaught browser errors');
 console.log('PASS no uncaught page errors. PHYSICAL ANDROID STILL REQUIRES SEPARATE TESTING.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
 if(context)await context.close().catch(()=>{});
 if(restoreBrowser)await restoreBrowser.close().catch(()=>{});
 if(server)await new Promise(resolve=>server.close(resolve));
 fs.rmSync(profile,{recursive:true,force:true});
});
