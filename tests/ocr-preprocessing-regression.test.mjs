import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

// Pixel-level regression against the previous OCR normalization loops.
// Identical synthetic image bytes ensure the new implementation cannot silently
// change RGB/BGR channel order, float32 rounding, or tensor dimensions.
const source=fs.readFileSync(new URL('../offline/ocr-worker.js',import.meta.url),'utf8');
function pixels(width,height){
 const rgba=new Uint8ClampedArray(width*height*4);
 for(let i=0,at=0;i<width*height;i++,at+=4){
  rgba[at]=(i*7+23)%256;
  rgba[at+1]=(i*13+67)%256;
  rgba[at+2]=(i*19+131)%256;
  rgba[at+3]=255;
 }
 return rgba;
}
class FakeCanvas{
 constructor(width,height){this.width=width;this.height=height;}
 getContext(){
  const canvas=this;
  return {
   drawImage(){},
   fillRect(){},
   fillStyle:'#ffffff',
   getImageData(){return {data:pixels(canvas.width,canvas.height)};}
  };
 }
}
const context=vm.createContext({
 self:{location:{href:'https://example.test/offline/ocr-worker.js'},navigator:{}},
 importScripts(){},
 ort:{env:{wasm:{}}},URL,Float32Array,Uint8ClampedArray,Uint8Array,
 OffscreenCanvas:FakeCanvas,Math,Promise
});
vm.runInContext(source,context,{filename:'ocr-worker.js'});

function previousDetector(sourceWidth,sourceHeight){
 const ratio=Math.min(1,960/Math.max(sourceWidth,sourceHeight));
 const width=Math.max(32,Math.round(sourceWidth*ratio/32)*32);
 const height=Math.max(32,Math.round(sourceHeight*ratio/32)*32);
 const rgba=pixels(width,height),data=new Float32Array(3*width*height);
 const means=[.485,.456,.406],stds=[.229,.224,.225];
 for(let i=0;i<width*height;i++){
  const channels=[rgba[i*4+2],rgba[i*4+1],rgba[i*4]];
  for(let c=0;c<3;c++)data[c*width*height+i]=(channels[c]/255-means[c])/stds[c];
 }
 return {width,height,data};
}
function previousCrop(){
 const rgba=pixels(320,48),data=new Float32Array(3*320*48);
 for(let i=0;i<320*48;i++){
  const channels=[rgba[i*4+2],rgba[i*4+1],rgba[i*4]];
  for(let c=0;c<3;c++)data[c*320*48+i]=channels[c]/127.5-1;
 }
 return data;
}
function assertSameTensor(actual,expected){
 assert.equal(actual.length,expected.length);
 const a=Buffer.from(actual.buffer,actual.byteOffset,actual.byteLength);
 const b=Buffer.from(expected.buffer,expected.byteOffset,expected.byteLength);
 assert.deepEqual(a,b,'Float32 tensor bytes differ from the prior implementation');
}

test('Lens OCR: detector preprocessor preserves exact float32 values for portrait input',()=>{
 const actual=vm.runInContext('detectorTensor({width:321,height:769})',context);
 const expected=previousDetector(321,769);
 assert.deepEqual([...actual.dims],[1,3,expected.height,expected.width]);
 assertSameTensor(actual.data,expected.data);
});
test('Lens OCR: detector preprocessor preserves exact float32 values for 2K landscape',()=>{
 const actual=vm.runInContext('detectorTensor({width:2000,height:1000})',context);
 const expected=previousDetector(2000,1000);
 assert.deepEqual([...actual.dims],[1,3,expected.height,expected.width]);
 assertSameTensor(actual.data,expected.data);
});
test('Lens OCR: recognizer crop preprocessor preserves exact BGR and float32 order',()=>{
 const actual=vm.runInContext(
  'cropTensor({width:640,height:480},{x:24,y:48,width:320,height:62})',context);
 assertSameTensor(actual,previousCrop());
});
test('Lens OCR: processing guards and ONNX inference paths remain present',()=>{
 assert.match(source,/PP-OCRv6 Tiny/);
 assert.match(source,/busy.*OCR local ocupado/);
 assert.match(source,/await initialize/);
 assert.match(source,/infer\('detector'/);
 assert.match(source,/infer\('recognizer'/);
});
