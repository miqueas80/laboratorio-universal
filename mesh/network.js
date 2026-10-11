/* NEXUS-X Malla Federal — opt-in HTTPS federation transport. No background polling. */
(function(root){
'use strict';
const mesh=root.NexusMeshLocal,core=root.NexusMeshCore;
if(!mesh||!core)return;
const SOURCE_KEY='nexus-mesh:sources-v2:'+mesh.scope+':'+mesh.activeId;
const MAX_BYTES=3*1024*1024,MAX_SOURCES=40;
const read=()=>{try{const value=JSON.parse(root.localStorage.getItem(SOURCE_KEY)||'[]');return Array.isArray(value)?value.filter(x=>x&&typeof x.url==='string'&&typeof x.publisherId==='string'):[];}catch{return [];}};
function canonicalUrl(address){
 if(typeof address!=='string'||address.length>800||address!==address.trim())throw Error('Dirección HTTPS inválida.');
 let uri;
 try{uri=new URL(address);}catch{throw Error('URL de catálogo inválida.');}
 if(uri.protocol!=='https:'||uri.username||uri.password||uri.hash||uri.search)throw Error('Usá una URL HTTPS pública sin parámetros, contraseñas ni fragmentos.');
 const host=uri.hostname.toLowerCase();
 if(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')||/^(?:127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host)||host==='[::1]')throw Error('El catálogo debe estar alojado en Internet público.');
 if(!/\.json$/i.test(uri.pathname))throw Error('El catálogo debe ser un archivo JSON firmado.');
 if(uri.href!==address)throw Error('Usá la URL HTTPS canónica completa.');
 return uri.href;
}
function sources(){return read().map(x=>({...x}));}
async function fetchCatalogue(address,approve,{subscribe=true}={}){
 if(!root.navigator?.onLine)throw Error('Sin conexión. Los catálogos guardados pueden buscarse offline.');
 const url=canonicalUrl(address);
 if(typeof approve!=='function')throw Error('Falta confirmación de identidad del publicador.');
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),12000);
 let response;
 try{
  response=await root.fetch(url,{method:'GET',mode:'cors',credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer',signal:controller.signal});
  if(!response.ok)throw Error('Servidor de la escuela respondió HTTP '+response.status+'.');
  const type=String(response.headers?.get('content-type')||'').toLowerCase();
  if(!type.includes('application/json')&&!type.includes('application/ld+json'))throw Error('El servidor no respondió con un catálogo JSON.');
  const declared=Number(response.headers?.get('content-length')||0);
  if(declared>MAX_BYTES)throw Error('El catálogo remoto supera los 3 MB.');
  const blob=await response.blob();
  if(blob.size<=0||blob.size>MAX_BYTES)throw Error('El catálogo descargado excede 3 MB.');
  const json=JSON.parse(await blob.text());
  if(subscribe){
   const current=read(),prev=current.find(x=>x.publisherId===json?.publisherId);
   if(prev&&prev.url!==url)throw Error('El origen cambió la URL institucional. Revisá el origen antes de seguirlo.');
   if(!prev&&current.length>=MAX_SOURCES)throw Error('Límite de catálogos suscritos alcanzado.');
  }
  const outcome=await mesh.importFeed(json,approve);
  if(subscribe){
   const current=read(),prev=current.find(x=>x.publisherId===outcome.publisherId);
   if(!prev){
    if(current.length>=MAX_SOURCES)throw Error('Límite de catálogos suscritos alcanzado.');
    root.localStorage.setItem(SOURCE_KEY,JSON.stringify([...current,{publisherId:outcome.publisherId,url}]));
   }
  }
  return {url,...outcome};
 }finally{clearTimeout(timer);controller.abort();}
}
async function refreshAll(approve,onProgress=()=>{}){
 const current=sources(),results=[];
 for(const item of current){
  try{const r=await fetchCatalogue(item.url,approve,{subscribe:false});results.push({publisherId:item.publisherId,ok:true,accepted:r.accepted});onProgress(item.publisherId+': verificado, '+r.accepted+' cambio(s).');}
  catch(e){results.push({publisherId:item.publisherId,ok:false,error:e.message});onProgress(item.publisherId+': '+e.message);}
 }
 return results;
}
root.NexusMeshNetwork=Object.freeze({canonicalUrl,sources,fetchCatalogue,refreshAll});
})(globalThis);
