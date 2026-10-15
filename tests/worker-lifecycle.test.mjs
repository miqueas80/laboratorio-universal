import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const core=fs.readFileSync(new URL('../offline/core.js',import.meta.url),'utf8');

function createHarness(){
 const workers=[],scripts=[],timers=new Map();
 let idCounter=0;
 class WorkerMock {
  constructor(url){this.url=url;this.messages=[];this.terminated=false;workers.push(this);}
  postMessage(message){this.messages.push(message);}
  terminate(){this.terminated=true;}
 }
 const context={
  URL,Response,Headers,Promise,Float32Array,Uint8Array,WebAssembly,
  setTimeout:(fn,ms)=>{const id=++idCounter;timers.set(id,{fn,ms});return id;},
  clearTimeout:id=>timers.delete(id),
  Worker:WorkerMock,
  CustomEvent:class {constructor(name,options){this.name=name;this.detail=options.detail;}},
  dispatchEvent:()=>{},
  navigator:{gpu:null},
  caches:{open:async()=>({match:async()=>undefined})},
  document:{
   currentScript:{src:'https://example.test/universal/offline/core.js'},
   createElement:()=>({remove(){this.removed=true;}}),
   head:{append:script=>scripts.push(script)}
  },
  NEXUS_OFFLINE_ASSETS:{version:'mock',files:[]}
 };
 context.globalThis=context;
 vm.runInNewContext(core,context,{filename:'offline/core.js'});
 const workersOf=name=>workers.filter(worker=>worker.url.endsWith('/'+name));
 const until=async(predicate)=>{
  for(let n=0;n<100;n++){if(predicate())return;await Promise.resolve();}
  assert.fail('expected async worker state was not reached');
 };
 const finishVisual=worker=>{
  const req=worker.messages[0];
  worker.onmessage({data:{id:req.id,result:{backend:'WASM',model:'mock-visual',at:'2026-10-15',durationMs:3}}});
 };
 const finishOcr=worker=>{
  const req=worker.messages[0];
  worker.onmessage({data:{id:req.id,result:{
   backend:'WASM',detector:'mock-detector',recognizer:'mock-recognizer',
   durationMs:10,lines:[{text:'NEXUS-X-0001'}]
  }}});
 };
 return {context,workers,scripts,timers,workersOf,until,finishVisual,finishOcr};
}

test('Lens: visual idle timeout releases only vision, never an active OCR request',async()=>{
 const h=createHarness();
 const pending=h.context.NexusOffline.prepareVision();
 await h.until(()=>h.workersOf('vision-worker.js')[0]?.messages.length);
 const visual=h.workersOf('vision-worker.js')[0];
 h.finishVisual(visual);
 await h.until(()=>h.workersOf('ocr-worker.js')[0]?.messages.length);
 const ocr=h.workersOf('ocr-worker.js')[0];
 const idle=[...h.timers.values()].find(t=>t.ms===60000);
 assert.ok(idle,'visual idle timer must be scheduled');
 idle.fn();
 assert.equal(visual.terminated,true);
 assert.equal(ocr.terminated,false,'visual idle must not terminate OCR');
 h.finishOcr(ocr);
 const outcome=await pending;
 assert.equal(outcome.model,'mock-visual');
 assert.equal(outcome.ocr.lines[0].text,'NEXUS-X-0001');
});

test('Lens: fatal visual worker error does not cancel a simultaneous OCR job',async()=>{
 const h=createHarness();
 const pending=h.context.NexusOffline.prepareVision();
 await h.until(()=>h.workersOf('vision-worker.js')[0]?.messages.length);
 const visual=h.workersOf('vision-worker.js')[0];
 h.finishVisual(visual);
 await h.until(()=>h.workersOf('ocr-worker.js')[0]?.messages.length);
 const ocr=h.workersOf('ocr-worker.js')[0];
 visual.onerror({message:'GPU context lost'});
 assert.equal(visual.terminated,true);
 assert.equal(ocr.terminated,false,'OCR must retain its independently running worker');
 h.finishOcr(ocr);
 const outcome=await pending;
 assert.equal(outcome.ocr.lines[0].text,'NEXUS-X-0001');
});

test('Lens: explicit user release still terminates both workers',async()=>{
 const h=createHarness();
 const pending=h.context.NexusOffline.prepareVision();
 await h.until(()=>h.workersOf('vision-worker.js')[0]?.messages.length);
 const visual=h.workersOf('vision-worker.js')[0];
 h.finishVisual(visual);
 await h.until(()=>h.workersOf('ocr-worker.js')[0]?.messages.length);
 const ocr=h.workersOf('ocr-worker.js')[0];
 h.context.NexusOffline.releaseVision();
 assert.equal(visual.terminated,true);
 assert.equal(ocr.terminated,true);
 const outcome=await pending;
 assert.equal(outcome.ocr.ready,false,'prepareVision reports OCR gracefully as unavailable');
 assert.match(outcome.ocr.error,/OCR liberado/);
});

test('Voice: invalid script loaded without Vosk can be retried and recovered',async()=>{
 const h=createHarness();
 const first=h.context.NexusOffline.prepareVoice();
 await h.until(()=>h.scripts.length===1);
 h.scripts[0].onload();
 await assert.rejects(first,/Runtime local inválido/);
 assert.equal(h.scripts[0].removed,true,'invalid runtime script must be removed');
 const second=h.context.NexusOffline.prepareVoice();
 await h.until(()=>h.scripts.length===2);
 let stopped=false;
 h.context.Vosk={Model:class {
  on(type,listener){if(type==='load')Promise.resolve().then(()=>listener({result:true}));}
  terminate(){stopped=true;}
 }};
 h.scripts[1].onload();
 await second;
 assert.equal(stopped,true,'loaded voice model must be released after preparation');
 assert.equal(h.scripts.length,2,'retry must append a fresh script element');
});
