import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash,webcrypto} from 'node:crypto';

const core=fs.readFileSync(new URL('../offline/core.js',import.meta.url),'utf8');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const original=[
 {path:'voice/model-a.bin',bytes:Buffer.from('voice one')},
 {path:'voice/model-b.bin',bytes:Buffer.from('voice two')}
];
const models=original.map(o=>({group:'voice',path:o.path,bytes:o.bytes.length,sha256:digest(o.bytes)}));
const base='https://example.test/universal/offline/';
const urlOf=path=>new URL(path,base).href;

function environment({free=1000,seed={},network={},usage=100}={}){
 const content=new Map(),unrelated=new Map([['institutional-inventory',new Response('user data')]]);
 const fetched=[];
 for(const [path,entry] of Object.entries(seed)){
  content.set(urlOf(path),new Response(entry.bytes,{headers:{'x-nexus-sha256':entry.header}}));
 }
 const offlineCache={
  match:async target=>content.get(target)?.clone(),
  delete:async target=>content.delete(target),
  put:async(target,response)=>content.set(target,response.clone())
 };
 const storage={
  estimate:async()=>({quota:usage+free,usage}),
  persist:async()=>true
 };
 const context={
  URL,Response,Headers,Uint8Array,WebAssembly,
  document:{currentScript:{src:base+'core.js'}},
  navigator:{storage,serviceWorker:{controller:{}}},
  caches:{open:async()=>offlineCache},
  crypto:webcrypto,
  fetch:async target=>{
   fetched.push(target);
   const path=target.slice(base.length);
   if(!(path in network))throw new Error('offline');
   return new Response(network[path]);
  },
  NEXUS_OFFLINE_ASSETS:{version:'test',files:models},
  dispatchEvent:()=>{},
 };
 context.globalThis=context;
 vm.runInNewContext(core,context,{filename:'offline/core.js'});
 return {api:context.NexusOffline,cache:content,unrelated,fetched};
}

const correct=path=>({bytes:original.find(x=>x.path===path).bytes,
 header:models.find(x=>x.path===path).sha256});

test('Offline: resumed model download counts only missing bytes, not the entire pack',async()=>{
 const a=models[0],b=models[1];
 const e=environment({
  free:b.bytes*1.2,usage:100,
  seed:{[a.path]:correct(a.path)},
  network:{[b.path]:correct(b.path).bytes}
 });
 const progress=[];
 const result=await e.api.prepare('voice',p=>progress.push(p));
 assert.equal(result.ready,true);
 assert.deepEqual(e.fetched,[urlOf(b.path)]);
 assert.equal((await e.api.cacheStatus('voice')).ready,true);
 assert.equal(progress.at(-1).done,a.bytes+b.bytes);
 assert.equal(e.unrelated.get('institutional-inventory')!==undefined,true);
});

test('Offline: stale cached checksum triggers a clean re-download',async()=>{
 const a=models[0],b=models[1];
 const e=environment({
  seed:{[a.path]:{bytes:Buffer.from('garbage'),header:'invalid'},[b.path]:correct(b.path)},
  network:{[a.path]:correct(a.path).bytes}
 });
 await e.api.prepare('voice');
 assert.deepEqual(e.fetched,[urlOf(a.path)]);
 assert.equal((await e.api.cacheStatus('voice')).ready,true);
 assert.equal(await e.cache.get(urlOf(a.path)).text(),'voice one');
});

test('Offline: corrupted cached bytes are repaired even if the checksum header claims success',async()=>{
 const a=models[0],b=models[1];
 const e=environment({
  seed:{[a.path]:{bytes:Buffer.from('tampered!'),header:a.sha256},[b.path]:correct(b.path)},
  network:{[a.path]:correct(a.path).bytes}
 });
 await e.api.prepare('voice');
 assert.deepEqual(e.fetched,[urlOf(a.path)]);
 assert.equal((await e.api.cacheStatus('voice')).ready,true);
 assert.equal(await e.cache.get(urlOf(a.path)).text(),'voice one');
});

test('Offline: insufficient remaining storage fails safely without touching valid cached models',async()=>{
 const a=models[0],b=models[1];
 const e=environment({
  free:b.bytes*.5,
  seed:{[a.path]:correct(a.path)},
  network:{[b.path]:correct(b.path).bytes}
 });
 await assert.rejects(e.api.prepare('voice'),/Espacio insuficiente/);
 assert.deepEqual(e.fetched,[]);
 assert.equal(await e.cache.get(urlOf(a.path)).text(),'voice one');
 assert.ok(e.unrelated.has('institutional-inventory'));
});

test('Offline: untrusted downloaded model never replaces a verified cached asset',async()=>{
 const a=models[0],b=models[1];
 const e=environment({
  seed:{[a.path]:correct(a.path)},
  network:{[b.path]:Buffer.from('bad bytes')}
 });
 await assert.rejects(e.api.prepare('voice'),/Descarga incompleta/);
 assert.ok(e.cache.has(urlOf(a.path)));
 assert.ok(!e.cache.has(urlOf(b.path)));
 assert.ok(e.unrelated.has('institutional-inventory'));
});
