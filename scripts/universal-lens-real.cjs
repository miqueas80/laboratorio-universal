/* Actual MobileCLIP-S0 + PP-OCRv6 Tiny browser acceptance and memory telemetry.
 * Runs only on disposable localhost profile with synthetic images. It never
 * touches GitHub Pages, production inventories, or institutional documents.
 *
 * npm install --no-save playwright@1.64.1
 * npx playwright install --with-deps chromium
 * node scripts/universal-lens-real.cjs
 */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'nexus-real-lens-'));
let server,context;
const issues=[];
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json',
 '.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png',
 '.webp':'image/webp','.wasm':'application/wasm','.onnx':'application/octet-stream',
 '.yml':'text/plain','.gz':'application/gzip'};
function handler(req,res){
 try{
  const reqUrl=new URL(req.url,'http://127.0.0.1');
  const prefix='/laboratorio-universal/';
  if(!reqUrl.pathname.startsWith(prefix)){res.writeHead(404).end();return;}
  const rel=decodeURIComponent(reqUrl.pathname.slice(prefix.length))||'index.html';
  const filename=path.resolve(root,rel);
  if(!filename.startsWith(root+path.sep)||!fs.existsSync(filename)||!fs.statSync(filename).isFile()){
   res.writeHead(404).end();return;
  }
  res.setHeader('Content-Type',mime[path.extname(filename)]||'application/octet-stream');
  res.setHeader('Cache-Control','no-store');
  fs.createReadStream(filename).pipe(res);
 }catch(e){res.writeHead(400).end(e.message);}
}
function watch(page){
 page.on('pageerror',error=>issues.push('PAGE '+error.message));
 page.on('console',message=>{if(message.type()==='error')issues.push('CONSOLE '+message.text());});
 page.on('response',response=>{if(response.status()>=400)issues.push('HTTP '+response.status()+' '+response.url());});
}
async function pageReady(page){
 await page.waitForFunction(()=>document.querySelector('#statInventory')?.textContent==='0'
  && document.querySelector('#taskDocs')?.textContent==='0'
  && document.querySelector('#statSystem')?.textContent==='OK',null,{timeout:30000});
}
function round(n){return Math.round(n*10)/10;}
function report(label,result){
 console.log('REAL LENS '+label+': '+JSON.stringify(result));
}
async function measure(page,label){
 const measurement=await page.evaluate(async()=>{
  const round=n=>Math.round(n*10)/10;
  const start=performance.now();
  const before=performance.memory?.usedJSHeapSize;
  const ready=await NexusOffline.prepareVision({forceWasm:true});
  if(ready.backend!=='WASM'||ready.ocr?.backend!=='WASM')
   throw new Error('Expected actual local WASM vision and OCR backends: '+JSON.stringify(ready));
  const createCanvas=(text)=>{
   const canvas=document.createElement('canvas');
   canvas.width=1200;canvas.height=300;
   const ctx=canvas.getContext('2d');
   ctx.fillStyle='#fff';ctx.fillRect(0,0,1200,300);
   ctx.fillStyle='#111';ctx.textBaseline='middle';ctx.font='bold 108px Arial';
   ctx.fillText(text,42,150);
   return canvas;
  };
  const canvas=createCanvas('NEXUS-X-0001');
  const visionStart=performance.now();
  const vision=await NexusOffline.analyze(canvas,{forceWasm:true});
  const visionMs=performance.now()-visionStart;
  if(!Array.isArray(vision.embedding)||vision.embedding.length!==512)
   throw new Error('MobileCLIP embedding was not produced');
  if(!Array.isArray(vision.candidates)||vision.candidates.length===0)
   throw new Error('MobileCLIP returned no ranked candidates');
  if(vision.backend!=='WASM')throw new Error('MobileCLIP used an unexpected backend: '+vision.backend);
  const ocrStart=performance.now();
  const ocr=await NexusOffline.recognizeText(canvas);
  const ocrMs=performance.now()-ocrStart;
  if(!Array.isArray(ocr.lines)||ocr.backend!=='WASM')
   throw new Error('PP-OCRv6 Tiny did not produce local WASM text results');
  const cache=await NexusOffline.cacheStatus('vision');
  if(!cache.ready)throw new Error('Vision cache was not complete after inference: '+cache.missing);
  return {
   readyBackend:ready.backend,ocrBackend:ready.ocr.backend,
   preparationAndInferenceMs:Math.round(performance.now()-start),
   visionMs:Math.round(visionMs),ocrMs:Math.round(ocrMs),
   visionCandidates:vision.candidates.length,visionAccepted:vision.accepted,
   ocrLines:ocr.lines.length,ocrPreview:ocr.lines.slice(0,3).map(x=>x.text.slice(0,60)),
   cacheReady:cache.ready,
   jsHeapDeltaMB:before===undefined?null:round((performance.memory.usedJSHeapSize-before)/1048576),
   jsHeapMB:performance.memory?.usedJSHeapSize?round(performance.memory.usedJSHeapSize/1048576):null
  };
 });
 report(label,measurement);
 assert.equal(measurement.cacheReady,true);
 return measurement;
}
(async()=>{
 server=http.createServer(handler);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port+'/laboratorio-universal/';
 const launch=()=>chromium.launchPersistentContext(profile,{
  headless:true,viewport:{width:412,height:915},
  serviceWorkers:'allow',args:['--enable-precise-memory-info']
 });
 context=await launch();
 let page=context.pages()[0]||await context.newPage();
 watch(page);
 await page.route(/^https?:\/\/(?!127\.0\.0\.1)/,route=>route.abort());
 await page.goto(base,{waitUntil:'domcontentloaded',timeout:30000});
 await pageReady(page);
 await page.evaluate(()=>navigator.serviceWorker.ready);
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller,{timeout:20000}).catch(async()=>{
  await page.reload({waitUntil:'domcontentloaded'});
  await pageReady(page);
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller,{timeout:20000});
 });
 const download=await page.evaluate(async()=>{
  const started=performance.now();
  const result=await NexusOffline.prepare('vision');
  const cached=await NexusOffline.cacheStatus('vision');
  return {ms:Math.round(performance.now()-started),bytes:result.bytes,
   cacheReady:cached.ready,persistent:result.persistent};
 });
 assert.equal(download.cacheReady,true,'Real model files did not pass SHA256 checks');
 report('download-and-sha256',download);
 const online=await measure(page,'online-wasm');
 console.log('PASS real MobileCLIP + PP-OCRv6 local WASM with verified on-disk models');

 // Worker memory must be releasable and models must be reloaded with no network.
 await page.evaluate(()=>NexusOffline.releaseVision());
 await context.close();context=null;
 context=await launch();
 await context.setOffline(true);
 page=context.pages()[0]||await context.newPage();
 watch(page);
 const blocked=[];
 page.on('requestfailed',request=>blocked.push(request.url()));
 await page.goto(base+'?lens-cold-offline=1',{waitUntil:'domcontentloaded',timeout:30000});
 await pageReady(page);
 assert.equal(await page.evaluate(()=>navigator.onLine),false);
 const offline=await measure(page,'cold-offline-wasm');
 assert.equal(offline.readyBackend,'WASM');
 assert.equal(offline.ocrBackend,'WASM');
 assert.deepEqual(issues,[],'unexpected browser errors');
 assert.deepEqual(blocked,[],'unexpected failed network requests while offline');
 console.log('PASS cold Chromium restart: real Lens inference from local verified model cache');
 console.log('PHYSICAL ANDROID WEBGPU / WASM SPEED NOT TESTED');
 if(process.env.GITHUB_STEP_SUMMARY){
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
   '\n### NEXUS-X Universal real Lens\n'+
   '| Check | Result |\n|---|---|\n'+
   '| Verified vision assets | '+download.bytes+' bytes |\n'+
   '| Online WASM vision | '+online.visionMs+' ms |\n'+
   '| Online WASM OCR | '+online.ocrMs+' ms |\n'+
   '| Cold offline WASM vision | '+offline.visionMs+' ms |\n'+
   '| Cold offline WASM OCR | '+offline.ocrMs+' ms |\n'+
   '| Cache and recovery | PASS |\n\n'+
   'Chromium runner, synthetic image, measurements are environment-specific.\n');
 }
})().catch(e=>{console.error(e);if(issues.length)console.error('BROWSER ISSUES:',issues);process.exitCode=1;})
.finally(async()=>{
 if(context)await context.close().catch(()=>{});
 if(server)await new Promise(resolve=>server.close(resolve));
 fs.rmSync(profile,{recursive:true,force:true});
});
