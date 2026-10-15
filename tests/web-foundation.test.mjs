import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const app=read('app.js'),sw=read('sw.js'),html=read('index.html');

function shellFiles(){
 const match=sw.match(/\bconst\s+CORE\s*=\s*\[([\s\S]*?)\];/);
 assert.ok(match,'CORE offline manifest missing');
 return [...match[1].matchAll(/['"]([^'"]+)['"]/g)].map(x=>x[1]);
}
function worker({failInstall=false}={}){
 const scope='https://example.test/laboratorio-universal/';
 const stores=new Map(),listeners={};
 let network=0;
 const cacheName=name=>({
  addAll:async requests=>{
   const store=stores.get(name);
   for(const request of requests){
    const url=new URL(request.url);
    assert.equal(url.origin,'https://example.test');
    assert.ok(url.pathname.startsWith('/laboratorio-universal/'));
    const relative=decodeURIComponent(url.pathname.slice('/laboratorio-universal/'.length))||'index.html';
    assert.ok(fs.existsSync(path.join(root,relative)),'missing shell asset: '+relative);
    if(failInstall&&relative==='app.js')throw new Error('incomplete download');
    store.set(request.url,new Response(relative,{status:200}));
   }
  },
  match:async target=>stores.get(name).get(typeof target==='string'?target:target.url)?.clone()
 });
 const caches={
  keys:async()=>[...stores.keys()],
  delete:async name=>stores.delete(name),
  open:async name=>{if(!stores.has(name))stores.set(name,new Map());return cacheName(name);}
 };
 const self={registration:{scope},addEventListener:(name,fn)=>listeners[name]=fn};
 const sandbox={self,URL,Request,Response,caches,fetch:async()=>{network++;throw new Error('offline')}};
 sandbox.globalThis=self;
 sandbox.importScripts=file=>vm.runInNewContext(read(file.replace(/^\.\//,'')),sandbox);
 vm.runInNewContext(sw,sandbox);
 return {
  scope,stores,
  lifecycle:async name=>{let promise;listeners[name]({waitUntil:p=>promise=p});return promise;},
  fetch:async(relative,mode)=>{
   let answer;
   listeners.fetch({request:{url:new URL(relative,scope).href,method:'GET',mode},respondWith:p=>answer=p});
   return answer?await answer:null;
  },
  network:()=>network
 };
}

test('Universal: no user or school data is bundled',()=>{
 const inventory=JSON.parse(read('inventory.json'));
 const catalog=JSON.parse(read('catalogo_maestro.json'));
 const docs=JSON.parse(read('documents-manifest.json'));
 assert.equal(inventory.recordCount,0);
 assert.deepEqual(inventory.records,[]);
 assert.deepEqual(catalog.sheets.Hoja1.rows,[]);
 assert.deepEqual(docs.documents,[]);
});

test('Universal: app and offline shell versions match',()=>{
 const a=app.match(/\bconst\s+APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
 const b=sw.match(/\bconst\s+VERSION\s*=\s*['"]([^'"]+)['"]/);
 assert.ok(a&&b,'release version constants missing');
 assert.equal(a[1],b[1],'mixed offline releases can break installations');
});

test('Universal: every atomic offline asset stays local and present',()=>{
 const files=shellFiles();
 assert.ok(files.length>=20,'offline shell unexpectedly small');
 assert.equal(files.length,new Set(files).size,'duplicate shell entries');
 for(const file of files){
  assert.match(file,/^\.\//,'offline shell file must be a relative URL');
  assert.ok(!file.split('/').includes('..'),'shell file escapes installation');
  const relative=file==='./'?'index.html':file.slice(2);
  assert.ok(fs.statSync(path.join(root,relative)).isFile(),'missing '+file);
 }
 assert.ok(files.includes('./config.js'));
 assert.ok(files.includes('./inventory.json'));
});

test('Universal: model manifests remain optional and integrity-checked',()=>{
 const context={};context.globalThis=context;
 vm.runInNewContext(read('offline/assets.js'),context);
 const manifest=context.NEXUS_OFFLINE_ASSETS;
 assert.ok(manifest?.version);
 assert.ok(Array.isArray(manifest.files)&&manifest.files.length>0);
 const seen=new Set();
 for(const asset of manifest.files){
  assert.ok(['voice','vision'].includes(asset.group));
  assert.match(asset.path,/^[a-z0-9_./-]+$/i);
  assert.ok(!asset.path.split('/').includes('..'));
  assert.ok(Number.isSafeInteger(asset.bytes)&&asset.bytes>0);
  assert.match(asset.sha256,/^[a-f0-9]{64}$/);
  assert.ok(!seen.has(asset.path),'duplicate model');
  seen.add(asset.path);
  assert.ok(fs.existsSync(path.join(root,'offline',asset.path)),asset.path);
 }
 assert.match(sw,/MODEL_CACHE/);
 assert.match(sw,/MODEL_URLS/);
});

test('Universal: service worker cold offline shell and navigation work',async()=>{
 const w=worker();
 await w.lifecycle('install');
 await w.lifecycle('activate');
 for(const file of ['./','./?from=pwa','./app.js?v=1','./config.js','./inventory.json','./offline/core.js']){
  const response=await w.fetch(file,file.includes('?from=')||file==='./'?'navigate':undefined);
  assert.equal(response?.status,200,file);
 }
 assert.equal(w.network(),0);
});

test('Universal: partial PWA installation preserves the previously cached release',async()=>{
 const w=worker({failInstall:true});
 const old='nexus-x-shell:%2Flaboratorio-universal%2F:old';
 const previouslyCached=new Map([['https://example.test/laboratorio-universal/index.html',new Response('old')]]);
 w.stores.set(old,previouslyCached);
 await assert.rejects(w.lifecycle('install'),/incomplete download/);
 assert.deepEqual([...w.stores.keys()],[old]);
 assert.equal(w.stores.get(old),previouslyCached);
 assert.doesNotMatch(sw,/\.skipWaiting\s*\(/);
 assert.doesNotMatch(sw,/\.claim\s*\(/);
});

test('Universal: activation never deletes another application cache',async()=>{
 const w=worker();
 w.stores.set('unrelated-service-cache',new Map());
 w.stores.set('nexus-x-shell:%2Fother-app%2F:previous',new Map());
 w.stores.set('nexus-x-shell:%2Flaboratorio-universal%2F:previous',new Map());
 await w.lifecycle('install');
 await w.lifecycle('activate');
 assert.ok(w.stores.has('unrelated-service-cache'));
 assert.ok(w.stores.has('nexus-x-shell:%2Fother-app%2F:previous'));
 assert.ok(!w.stores.has('nexus-x-shell:%2Flaboratorio-universal%2F:previous'));
});

test('Universal: installed local stores are scoped by deployment path',()=>{
 assert.match(app,/const INSTALL_SCOPE\s*=\s*encodeURIComponent\(new URL\('\.\/',location\.href\)\.pathname\)/);
 assert.match(app,/const STORE_PREFIX\s*=\s*'nexus-x-institutional:'\+INSTALL_SCOPE/);
 assert.match(app,/const DOC_DB\s*=\s*'NEXUS_X_INSTITUTIONAL_DOCUMENTS_V1_'\+INSTALL_SCOPE/);
 assert.match(app,/getItem:key=>localStorage\.getItem\(STORE_PREFIX\+key\)/);
 assert.match(read('offline/core.js'),/nexus-institutional-visual-references-v1:/);
 // NOTE: path scoping is not a substitute for separate HTTPS origins and authorization.
});

test('Universal: preserve installability, accessibility defaults and CSP',()=>{
 const manifest=JSON.parse(read('manifest.webmanifest'));
 assert.equal(manifest.start_url,'./');
 assert.equal(manifest.scope,'./');
 assert.equal(manifest.display,'standalone');
 assert.ok(manifest.icons.some(icon=>icon.sizes==='192x192'));
 assert.ok(manifest.icons.some(icon=>icon.sizes==='512x512'));
 assert.match(html,/lang="es"/);
 assert.match(html,/prefers-reduced-motion/);
 assert.match(html,/Content-Security-Policy/);
 assert.match(html,/object-src\s+'none'/);
});
