'use strict';
importScripts('./v1/vision/ort.webgpu.min.js');
ort.env.wasm.wasmPaths = new URL('./v1/vision/', self.location.href).href;
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;

const OCR_ROOT='./v1/vision/ocr/';
const MODEL_PATHS={
  detector:OCR_ROOT+'PP-OCRv6_tiny_det.onnx',
  recognizer:OCR_ROOT+'PP-OCRv6_tiny_rec.onnx',
  detectorConfig:OCR_ROOT+'PP-OCRv6_tiny_det.yml',
  recognizerConfig:OCR_ROOT+'PP-OCRv6_tiny_rec.yml'
};
let detector,recognizer,characters=[],backend='',backendError='',loading,busy=false;

async function responseText(path){
  const response=await fetch(path);
  if(!response.ok)throw new Error(`OCR asset ${path} HTTP ${response.status}`);
  return response.text();
}
function parseCharacterDictionary(yaml){
  const match=yaml.match(/^  character_dict:\s*\r?\n((?:  - .*(?:\r?\n|$))+)/m);
  if(!match)throw new Error('PP-OCRv6 Tiny recognizer inference.yml no contiene character_dict.');
  return match[1].split(/\r?\n/).filter(line=>line.startsWith('  - ')).map(line=>{
    let value=line.slice(4).trim();
    if(value.startsWith("'")&&value.endsWith("'"))value=value.slice(1,-1).replace(/''/g,"'");
    else if(value.startsWith('"')&&value.endsWith('"'))value=value.slice(1,-1).replace(/\\"/g,'"');
    return value;
  });
}
async function releaseSessions(){
  await Promise.all([detector?.release(),recognizer?.release()]);
  detector=recognizer=null;
}
async function initialize(forceWasm=false){
  if(detector&&recognizer&&(!forceWasm||backend==='WASM'))return;
  if(loading)return loading;
  loading=(async()=>{
    if(detector||recognizer)await releaseSessions();
    const [detectorYaml,recognizerYaml]=await Promise.all([
      responseText(MODEL_PATHS.detectorConfig),
      responseText(MODEL_PATHS.recognizerConfig)
    ]);
    characters=parseCharacterDictionary(recognizerYaml);
    characters.push(' ');
    if(!forceWasm&&self.navigator.gpu){
      try{
        const options={executionProviders:['webgpu']};
        detector=await ort.InferenceSession.create(new URL(MODEL_PATHS.detector,self.location.href).href,options);
        recognizer=await ort.InferenceSession.create(new URL(MODEL_PATHS.recognizer,self.location.href).href,options);
        backend='WebGPU';backendError='';
        return;
      }catch(error){
        backendError=String(error?.message||error);
        await releaseSessions();
      }
    }
    const options={executionProviders:['wasm']};
    try{
      detector=await ort.InferenceSession.create(new URL(MODEL_PATHS.detector,self.location.href).href,options);
      recognizer=await ort.InferenceSession.create(new URL(MODEL_PATHS.recognizer,self.location.href).href,options);
      backend='WASM';
    }catch(error){
      await releaseSessions();
      throw new Error(`PP-OCRv6 Tiny no es compatible con ONNX Runtime Web WASM: ${error?.message||error}`);
    }
  })();
  try{await loading;}finally{loading=null;}
}
async function runModel(kind,tensor){
  const getSession=()=>kind==='detector'?detector:recognizer;
  const execute=async()=>{
    const session=getSession(),name=session.inputNames[0];
    if(!name)throw new Error(`PP-OCRv6 Tiny ${kind} ONNX no declara entrada.`);
    return session.run({[name]:tensor});
  };
  try{return await execute();}
  catch(error){
    if(backend!=='WebGPU')throw error;
    backendError=String(error?.message||error);
    await initialize(true);
    try{return await execute();}
    catch(wasmError){
      throw new Error(`PP-OCRv6 Tiny ${kind} falló en ONNX Runtime Web WASM después del fallback WebGPU: ${wasmError?.message||wasmError}`);
    }
  }
}
function firstFeatureTensor(outputs){
  for(const value of Object.values(outputs)){
    if(value?.dims?.length>=3&&value.data?.length)return value;
  }
  throw new Error('PP-OCRv6 Tiny no produjo un mapa/logits reconocible en ONNX Runtime Web.');
}
async function infer(kind,data,dims){
  await initialize();
  const session=kind==='detector'?detector:recognizer;
  const name=session.inputNames[0];
  if(!name)throw new Error(`PP-OCRv6 Tiny ${kind} ONNX no declara entrada.`);
  const input=new ort.Tensor('float32',data,dims);
  let outputs;
  try{
    outputs=await runModel(kind,input);
    const feature=firstFeatureTensor(outputs);
    return {data:new Float32Array(feature.data),dims:[...feature.dims]};
  }finally{
    input.dispose();
    if(outputs)for(const output of Object.values(outputs))output.dispose();
  }
}
function sourceCanvas({rgba,width,height}){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||rgba.byteLength!==width*height*4)
    throw new Error('Captura OCR inválida.');
  if(typeof OffscreenCanvas!=='function'||typeof ImageData!=='function')
    throw new Error('PP-OCRv6 Tiny requiere OffscreenCanvas e ImageData en el worker local.');
  const canvas=new OffscreenCanvas(width,height),ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba),width,height),0,0);
  return canvas;
}
function detectorTensor(source){
  const ratio=Math.min(1,960/Math.max(source.width,source.height));
  const width=Math.max(32,Math.round(source.width*ratio/32)*32);
  const height=Math.max(32,Math.round(source.height*ratio/32)*32);
  const canvas=new OffscreenCanvas(width,height),ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(source,0,0,width,height);
  const rgba=ctx.getImageData(0,0,width,height).data,data=new Float32Array(3*width*height);
  const means=[.485,.456,.406],stds=[.229,.224,.225];
  for(let i=0;i<width*height;i++){
    const channels=[rgba[i*4+2],rgba[i*4+1],rgba[i*4]];
    for(let c=0;c<3;c++)data[c*width*height+i]=(channels[c]/255-means[c])/stds[c];
  }
  return {data,dims:[1,3,height,width],width,height,scaleX:width/source.width,scaleY:height/source.height};
}
function probabilityMap(result){
  const dims=result.dims;
  const height=dims.at(-2),width=dims.at(-1);
  if(!width||!height||result.data.length<width*height)throw new Error(`Mapa DB ONNX inesperado: [${dims.join(',')}].`);
  return {width,height,data:result.data};
}
function boxesFromMap(map,shape){
  const total=map.width*map.height,visited=new Uint8Array(total),queue=new Int32Array(total),boxes=[];
  const pixelScaleX=shape.width/map.width,pixelScaleY=shape.height/map.height;
  for(let i=0;i<total&&boxes.length<3000;i++){
    if(visited[i]||map.data[i]<=.2)continue;
    let head=0,tail=0,sum=0,minX=map.width,minY=map.height,maxX=-1,maxY=-1;
    queue[tail++]=i;visited[i]=1;
    while(head<tail){
      const index=queue[head++],x=index%map.width,y=(index-x)/map.width;
      sum+=map.data[index];minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        if(!dx&&!dy)continue;
        const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=map.width||ny>=map.height)continue;
        const next=ny*map.width+nx;if(!visited[next]&&map.data[next]>.2){visited[next]=1;queue[tail++]=next;}
      }
    }
    if(tail<3||maxX-minX<2||maxY-minY<2||sum/tail<.4)continue;
    const width=maxX-minX+1,height=maxY-minY+1,margin=width*height*(1.4*1.4-1)/(2*(width+height));
    const left=Math.max(0,(minX-margin)*pixelScaleX/shape.scaleX);
    const top=Math.max(0,(minY-margin)*pixelScaleY/shape.scaleY);
    const right=Math.min(shape.sourceWidth,(maxX+1+margin)*pixelScaleX/shape.scaleX);
    const bottom=Math.min(shape.sourceHeight,(maxY+1+margin)*pixelScaleY/shape.scaleY);
    boxes.push({x:left,y:top,width:right-left,height:bottom-top,score:sum/tail});
  }
  return mergeTextBoxes(boxes).slice(0,80);
}
function mergeTextBoxes(boxes){
  const rows=[];
  for(const box of boxes.sort((a,b)=>(a.y+a.height/2)-(b.y+b.height/2)||a.x-b.x)){
    let row=rows.find(item=>{
      const overlap=Math.max(0,Math.min(item.bottom,box.y+box.height)-Math.max(item.top,box.y));
      return overlap/Math.max(1,Math.min(item.bottom-item.top,box.height))>=.35;
    });
    if(!row){row={top:box.y,bottom:box.y+box.height,boxes:[]};rows.push(row);}
    row.boxes.push(box);row.top=Math.min(row.top,box.y);row.bottom=Math.max(row.bottom,box.y+box.height);
  }
  const merged=[];
  for(const row of rows){
    let line=null;
    for(const box of row.boxes.sort((a,b)=>a.x-b.x)){
      const gap=line?box.x-(line.x+line.width):Infinity;
      if(!line||gap>Math.max(line.height,box.height)*1.5){
        line={...box};merged.push(line);continue;
      }
      const right=Math.max(line.x+line.width,box.x+box.width),bottom=Math.max(line.y+line.height,box.y+box.height);
      line.x=Math.min(line.x,box.x);line.y=Math.min(line.y,box.y);line.width=right-line.x;line.height=bottom-line.y;
      line.score=(line.score+box.score)/2;
    }
  }
  return merged.sort((a,b)=>a.y-b.y||a.x-b.x);
}
function cropTensor(source,box){
  const left=Math.max(0,Math.floor(box.x)),top=Math.max(0,Math.floor(box.y));
  const width=Math.max(1,Math.min(source.width-left,Math.ceil(box.width))),height=Math.max(1,Math.min(source.height-top,Math.ceil(box.height)));
  const crop=new OffscreenCanvas(width,height),cropCtx=crop.getContext('2d',{willReadFrequently:true});
  cropCtx.drawImage(source,left,top,width,height,0,0,width,height);
  const ratio=Math.min(48/height,320/width),scaledWidth=Math.max(1,Math.min(320,Math.round(width*ratio))),scaledHeight=Math.max(1,Math.min(48,Math.round(height*ratio)));
  const resized=new OffscreenCanvas(320,48),ctx=resized.getContext('2d',{willReadFrequently:true});
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,320,48);ctx.drawImage(crop,0,0,width,height,0,0,scaledWidth,scaledHeight);
  const rgba=ctx.getImageData(0,0,320,48).data,data=new Float32Array(3*320*48);
  for(let i=0;i<320*48;i++){
    const channels=[rgba[i*4+2],rgba[i*4+1],rgba[i*4]];
    for(let c=0;c<3;c++)data[c*320*48+i]=channels[c]/127.5-1;
  }
  return data;
}
function decodeCtc(result){
  const {data,dims}=result,time=dims.at(-2),classes=dims.at(-1);
  if(!time||!classes||data.length<time*classes)throw new Error(`Logits CTC ONNX inesperados: [${dims.join(',')}].`);
  let text='',last=-1,confidence=0,count=0;
  for(let t=0;t<time;t++){
    let max=-Infinity,index=0,sum=0,probabilities=true;
    for(let c=0;c<classes;c++){
      const value=data[t*classes+c];if(value>max){max=value;index=c;}
      sum+=value;if(value<0||value>1.001)probabilities=false;
    }
    let tokenConfidence=max;
    if(!probabilities||sum<.9||sum>1.1){
      let denominator=0;for(let c=0;c<classes;c++)denominator+=Math.exp(data[t*classes+c]-max);
      tokenConfidence=1/denominator;
    }
    if(index!==0&&index!==last){
      const character=characters[index-1];if(character!==undefined){text+=character;confidence+=tokenConfidence;count++;}
    }
    last=index;
  }
  return {text:text.trim(),confidence:count?confidence/count:0};
}
async function recognize({rgba,width,height}){
  await initialize();
  const source=sourceCanvas({rgba,width,height}),shape=detectorTensor(source),map=probabilityMap(await infer('detector',shape.data,shape.dims));
  const boxes=boxesFromMap(map,{...shape,sourceWidth:width,sourceHeight:height});
  const lines=[];
  for(const box of boxes){
    if(box.width<4||box.height<4)continue;
    const decoded=decodeCtc(await infer('recognizer',cropTensor(source,box),[1,3,48,320]));
    if(decoded.text)lines.push({text:decoded.text,confidence:decoded.confidence,boundingBox:{x:Math.round(box.x),y:Math.round(box.y),width:Math.round(box.width),height:Math.round(box.height)},detectorScore:box.score});
  }
  return {runtime:'PP-OCRv6 Tiny',backend,backendError:backendError||'',detector:'PP-OCRv6_tiny_det',recognizer:'PP-OCRv6_tiny_rec',cached:true,durationMs:0,lines};
}
self.onmessage=async({data})=>{
  const {id,type}=data;if(busy){self.postMessage({id,error:'OCR local ocupado'});return;}busy=true;
  try{
    await initialize(!!data.forceWasm);
    if(type==='prepare'){
      self.postMessage({id,result:{runtime:'PP-OCRv6 Tiny',backend,backendError:backendError||'',detector:'PP-OCRv6_tiny_det',recognizer:'PP-OCRv6_tiny_rec',dictionarySize:characters.length,durationMs:0,lines:[]}});
    }else if(type==='recognize'){
      const started=performance.now(),result=await recognize(data.image);
      result.durationMs=Math.round(performance.now()-started);
      self.postMessage({id,result});
    }else throw new Error(`Tipo de solicitud OCR desconocido: ${type}`);
  }catch(error){self.postMessage({id,error:String(error?.message||error)});}
  finally{busy=false;}
};
