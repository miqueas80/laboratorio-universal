import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const visionSource=fs.readFileSync(new URL('../offline/vision-worker.js',import.meta.url),'utf8');
const ocrSource=fs.readFileSync(new URL('../offline/ocr-worker.js',import.meta.url),'utf8');
const vector=(at=0)=>{
 const arr=Array(512).fill(0);arr[at]=1;return arr;
};
const prototypes={
 model:'MobileCLIP-S0',
 classes:[
  {id:'beaker',label:'Vaso de precipitados',group:'material',embedding:vector(0)},
  {id:'negative',label:'Fondo vacío',group:'negative',reject:true,embedding:vector(1)}
 ]
};

function makeVision({gpuCreateFails=false,gpuRunFails=false,gpuReleaseFails=false}={}){
 const calls={created:[],released:[],run:[],disposed:0};
 const ort={
  env:{wasm:{}},
  Tensor:class {
   constructor(type,data,dims){this.type=type;this.data=data;this.dims=dims;}
   dispose(){calls.disposed++;}
  },
  InferenceSession:{
   create:async(_model,options)=>{
    const ep=options.executionProviders[0];
    calls.created.push(ep);
    if(ep==='webgpu'&&gpuCreateFails)throw Error('GPU initialization failed');
    return {
     release:async()=>{
      calls.released.push(ep);
      if(ep==='webgpu'&&gpuReleaseFails)throw Error('GPU context lost during release');
     },
     run:async()=>{
      calls.run.push(ep);
      if(ep==='webgpu'&&gpuRunFails)throw Error('GPU device lost during inference');
      return {image_embeds:{data:new Float32Array(vector(0)),dispose(){calls.disposed++;}}};
     }
    };
   }
  }
 };
 const ctx=vm.createContext({
  self:{location:{href:'https://example.test/offline/vision-worker.js'},navigator:{gpu:{}}},
  navigator:{gpu:{}},ort,URL,Float32Array,ArrayBuffer,
  importScripts(){},fetch:async()=>({json:async()=>prototypes}),
  performance:{now:()=>1},Date,
 });
 vm.runInContext(visionSource,ctx,{filename:'vision-worker.js'});
 return {ctx,calls,initialize:()=>vm.runInContext('initialize()',ctx),
  infer:()=>vm.runInContext('infer(new ArrayBuffer(3*256*256*4))',ctx)};
}

function makeOcr({gpuCreateRecognizerFails=false,gpuRunFails=false,gpuReleaseFails=false}={}){
 const calls={created:[],released:[],run:[]};
 const ort={
  env:{wasm:{}},
  InferenceSession:{
   create:async(model,options)=>{
    const ep=options.executionProviders[0],
     kind=model.includes('rec.onnx')?'recognizer':'detector';
    calls.created.push(ep+':'+kind);
    if(ep==='webgpu'&&kind==='recognizer'&&gpuCreateRecognizerFails)
     throw Error('GPU recognizer initialization failed');
    return {
     inputNames:['pixel_values'],
     release:async()=>{
      calls.released.push(ep+':'+kind);
      if(ep==='webgpu'&&gpuReleaseFails)throw Error('GPU device already lost');
     },
     run:async()=>{
      calls.run.push(ep+':'+kind);
      if(ep==='webgpu'&&gpuRunFails)throw Error('GPU device lost');
      return {ok:true};
     }
    };
   }
  }
 };
 const ctx=vm.createContext({
  self:{location:{href:'https://example.test/offline/ocr-worker.js'},navigator:{gpu:{}}},
  ort,URL,Promise,Math,Date,
  importScripts(){},fetch:async()=>({ok:true,text:async()=> '  character_dict:\n  - A\n  - B\n'}),
 });
 vm.runInContext(ocrSource,ctx,{filename:'ocr-worker.js'});
 return {ctx,calls,initialize:()=>vm.runInContext('initialize()',ctx),
  runDetector:()=>vm.runInContext("runModel('detector',{})",ctx)};
}

test('Lens: WebGPU session lost during inference and release falls back to WASM',async()=>{
 const h=makeVision({gpuRunFails:true,gpuReleaseFails:true});
 await h.initialize();
 assert.equal(vm.runInContext('backend',h.ctx),'WebGPU');
 const result=await h.infer();
 assert.equal(result.embedding.length,512);
 assert.equal(vm.runInContext('backend',h.ctx),'WASM');
 assert.deepEqual(h.calls.created,['webgpu','wasm']);
 assert.deepEqual(h.calls.run,['webgpu','wasm']);
 assert.deepEqual(h.calls.released,['webgpu']);
 assert.equal(h.calls.disposed,2,'input and output tensors must be disposed');
 await h.infer();
 assert.deepEqual(h.calls.created,['webgpu','wasm'],'WASM session should be reused');
});

test('Lens: WebGPU initialization failure falls back without altering model output',async()=>{
 const h=makeVision({gpuCreateFails:true});
 await h.initialize();
 const result=await h.infer();
 assert.equal(vm.runInContext('backend',h.ctx),'WASM');
 assert.deepEqual(h.calls.created,['webgpu','wasm']);
 assert.equal(result.rank.candidates[0].id,'beaker');
});

test('OCR: partial WebGPU initialization failure and GPU release error recover using WASM',async()=>{
 const h=makeOcr({gpuCreateRecognizerFails:true,gpuReleaseFails:true});
 await h.initialize();
 assert.equal(vm.runInContext('backend',h.ctx),'WASM');
 assert.deepEqual(h.calls.created,[
  'webgpu:detector','webgpu:recognizer','wasm:detector','wasm:recognizer'
 ]);
 assert.deepEqual(h.calls.released,['webgpu:detector']);
 assert.equal((await h.runDetector()).ok,true);
});

test('OCR: WebGPU inference failure and both release failures recover using WASM',async()=>{
 const h=makeOcr({gpuRunFails:true,gpuReleaseFails:true});
 await h.initialize();
 assert.equal(vm.runInContext('backend',h.ctx),'WebGPU');
 assert.equal((await h.runDetector()).ok,true);
 assert.equal(vm.runInContext('backend',h.ctx),'WASM');
 assert.deepEqual(h.calls.run,['webgpu:detector','wasm:detector']);
 assert.deepEqual(h.calls.released,['webgpu:detector','webgpu:recognizer']);
 assert.deepEqual(h.calls.created,[
  'webgpu:detector','webgpu:recognizer','wasm:detector','wasm:recognizer'
 ]);
 await h.runDetector();
 assert.equal(h.calls.created.length,4,'WASM OCR sessions should be reused');
});
