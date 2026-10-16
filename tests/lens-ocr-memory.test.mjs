import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../offline/core.js',import.meta.url),'utf8');
const sizeBegin=source.indexOf(' const OCR_CAPTURE_MAX_PIXELS=');
const sizeEnd=source.indexOf(' async function ocrRequest(',sizeBegin);
assert.ok(sizeBegin>0&&sizeEnd>sizeBegin);
const dimensions=vm.runInNewContext(source.slice(sizeBegin,sizeEnd)+'\nthis.calculate=boundedOcrDimensions;this.calculate;');

function mockBrowser(){
 const workers=[],canvases=[],timers=new Map();
 let timerId=0,postError=false;
 class MockWorker{
  constructor(url){this.url=url;this.messages=[];workers.push(this);}
  postMessage(message,transfer){
   if(postError){postError=false;throw new Error('Simulated DataCloneError');}
   this.messages.push({message,transfer});
  }
  terminate(){}
 }
 const ctx={
  URL,Response,Headers,Promise,Float32Array,Uint8Array,WebAssembly,
  CustomEvent:class{constructor(name,options){this.name=name;this.detail=options.detail;}},
  dispatchEvent(){},
  setTimeout:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id;},
  clearTimeout:id=>timers.delete(id),
  Worker:MockWorker,navigator:{gpu:null},
  NEXUS_OFFLINE_ASSETS:{version:'mock',files:[]},
  caches:{open:async()=>({match:async()=>undefined})},
  document:{
   currentScript:{src:'https://school.test/universal/offline/core.js'},
   createElement(type){
    assert.equal(type,'canvas');
    const canvas={width:0,height:0};
    canvas.getContext=()=>({
     drawImage(){},
     getImageData:(_x,_y,width,height)=>({
      data:new Uint8ClampedArray(width*height*4)
     })
    });
    canvases.push(canvas);
    return canvas;
   },
   head:{append(){}}
  }
 };
 ctx.globalThis=ctx;
 vm.runInNewContext(source,ctx,{filename:'offline/core.js'});
 const wait=async predicate=>{
  for(let i=0;i<200;i++){if(predicate())return;await Promise.resolve();}
  assert.fail('Worker never received the expected request');
 };
 return {
  ctx,workers,canvases,timers,wait,
  failNextPost:()=>{postError=true;},
  worker:name=>workers.find(x=>x.url.endsWith('/'+name)),
  resolve:(worker,result)=>{
   const id=worker.messages.at(-1).message.id;
   worker.onmessage({data:{id,result}});
  }
 };
}

test('Lens: normal-sized OCR captures retain exact original dimensions',async()=>{
 const h=mockBrowser();
 const request=h.ctx.NexusOffline.recognizeText({width:1400,height:900});
 await h.wait(()=>h.worker('ocr-worker.js')?.messages.length);
 const msg=h.worker('ocr-worker.js').messages[0].message;
 assert.equal(msg.image.width,1400);
 assert.equal(msg.image.height,900);
 assert.equal(msg.image.rgba.byteLength,1400*900*4);
 h.resolve(h.worker('ocr-worker.js'),{backend:'WASM',lines:[],durationMs:0});
 await request;
});

test('Lens: high-resolution phone photos respect 8 MiPixel RGBA budget while keeping aspect ratio',()=>{
 const {width,height,resized}=dimensions(12000,9000);
 assert.equal(resized,true);
 assert.ok(width*height<=8*1024*1024);
 assert.ok(Math.abs(width/height-12000/9000)<0.002);
 assert.ok(width*height*4<12000*9000*4/10);
});

test('Lens: rejects impossible and non-integer dimensions before allocating RGBA',()=>{
 for(const pair of [[0,120],[120,0],[NaN,12],[500.5,120],[Infinity,1],[-1,10],[Number.MAX_SAFE_INTEGER,12]]){
  assert.throws(()=>dimensions(...pair),/dimensiones inválidas|demasiado grande/);
 }
});

test('Lens: an OCR worker DataCloneError rejects immediately and next request succeeds',async()=>{
 const h=mockBrowser();
 h.failNextPost();
 await assert.rejects(h.ctx.NexusOffline.recognizeText({width:100,height:100}),/DataCloneError/);
 assert.equal([...h.timers.values()].filter(t=>t.ms===90000).length,0,'no stuck OCR timeout');
 const next=h.ctx.NexusOffline.recognizeText({width:100,height:100});
 await h.wait(()=>h.worker('ocr-worker.js')?.messages.length);
 h.resolve(h.worker('ocr-worker.js'),{backend:'WASM',lines:[{text:'NEXUS'}],durationMs:4});
 assert.equal((await next).lines[0].text,'NEXUS');
});

test('Lens: failed vision worker dispatch does not block the next prepare cycle',async()=>{
 const h=mockBrowser();
 h.failNextPost();
 await assert.rejects(h.ctx.NexusOffline.prepareVision(),/DataCloneError/);
 assert.equal([...h.timers.values()].filter(t=>t.ms===90000).length,0,'no stuck vision timeout');
 const next=h.ctx.NexusOffline.prepareVision();
 await h.wait(()=>h.worker('vision-worker.js')?.messages.length);
 h.resolve(h.worker('vision-worker.js'),{backend:'WASM',model:'MobileCLIP-S0'});
 await h.wait(()=>h.worker('ocr-worker.js')?.messages.length);
 h.resolve(h.worker('ocr-worker.js'),{backend:'WASM',model:'PP-OCRv6 Tiny'});
 const result=await next;
 assert.equal(result.backend,'WASM');
 assert.equal(result.ocr.backend,'WASM');
});
