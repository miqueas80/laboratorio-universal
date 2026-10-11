/* Opt-in national federator discovery; NEVER trust unsigned search previews.
 * No fetch at startup. Requires explicit click and independent key approval.
 */
(function(root){
'use strict';
const core=root.NexusMeshCore,local=root.NexusMeshLocal;
if(!core||!local)return;
const SEARCH_BYTES=256*1024,FEED_BYTES=3*1024*1024;
const WEB_TIMEOUT=12000;
const tenant=/^ws-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const assert=(condition,message)=>{if(!condition)throw Error(message);};
function originOf(input){
 assert(typeof input==='string'&&input===input.trim()&&input.length>0&&input.length<=350,'Dirección del federador inválida.');
 let url;try{url=new URL(input);}catch{throw Error('URL de federador inválida.');}
 const host=url.hostname.toLowerCase();
 assert(url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/'&&url.port==='','Usá solo el origen HTTPS del federador, sin rutas, claves ni parámetros.');
 assert(host.includes('.')&&!['localhost','127.0.0.1','0.0.0.0'].includes(host)&&!host.endsWith('.local')&&!host.endsWith('.internal')&&!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host),'El federador debe tener un dominio público.');
 return url.origin;
}
async function fetchJson(url,limit){
 assert(root.navigator?.onLine,'Sin Internet: buscá en el catálogo local.');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),WEB_TIMEOUT);
 try{
  const response=await root.fetch(url,{method:'GET',mode:'cors',credentials:'omit',redirect:'error',
   referrerPolicy:'no-referrer',cache:'no-store',signal:controller.signal});
  assert(response.ok,'El federador respondió HTTP '+response.status+'.');
  const type=String(response.headers?.get('content-type')||'').toLowerCase();
  assert(type.includes('application/json')||type.includes('application/ld+json'),'La respuesta no es JSON.');
  const length=Number(response.headers?.get('content-length')||0);
  assert(length<=limit,'Respuesta demasiado grande.');
  const blob=await response.blob();
  assert(blob.size>0&&blob.size<=limit,'Respuesta demasiado grande.');
  return JSON.parse(await blob.text());
 }finally{clearTimeout(timer);controller.abort();}
}
function checkHit(origin,hit){
 assert(hit&&typeof hit==='object'&&!Array.isArray(hit),'Entrada de búsqueda inválida.');
 const publisherId=String(hit.publisherId||'');
 assert(tenant.test(publisherId),'La búsqueda devolvió una institución inválida.');
 const record=core.validateRecord(hit.record);
 assert(record.publisherId===publisherId&&record.status==='published','La ficha no coincide con la escuela.');
 assert(Number.isSafeInteger(hit.cursor)&&hit.cursor>=1,'Cursor de búsqueda inválido.');
 const expected=origin+'/api/v1/catalog/'+publisherId;
 assert(hit.catalogUrl===expected,'La fuente firmada de la ficha no coincide con el federador.');
 return {publisherId,record,cursor:hit.cursor,catalogUrl:expected,origin};
}
async function search(originInput,{q='',subject='',level='',cursor=0,limit=25}={}){
 const origin=originOf(originInput);
 assert(typeof q==='string'&&q.length<=120,'Consulta demasiado larga.');
 assert(!subject||core.SUBJECTS.includes(subject),'Materia inválida.');
 assert(!level||core.LEVELS.includes(level),'Nivel inválido.');
 assert(Number.isSafeInteger(cursor)&&cursor>=0,'Cursor inválido.');
 assert(Number.isSafeInteger(limit)&&limit>=1&&limit<=25,'Máximo 25 recursos por página.');
 const url=new URL('/api/v1/search',origin);
 if(q.trim())url.searchParams.set('q',q.trim());
 if(subject)url.searchParams.set('subject',subject);
 if(level)url.searchParams.set('level',level);
 url.searchParams.set('cursor',String(cursor));url.searchParams.set('limit',String(limit));
 const payload=await fetchJson(url.href,SEARCH_BYTES);
 assert(payload?.schema===1&&Array.isArray(payload.results)&&payload.results.length<=limit,'Respuesta del federador inválida.');
 assert(payload.notice==='discovery_only_verify_signed_catalogue_before_trust','El federador no anunció verificación obligatoria.');
 const hits=payload.results.map(hit=>checkHit(origin,hit));
 const ids=new Set();let last=cursor;
 for(const hit of hits){
  assert(hit.cursor>last,'El cursor del federador no avanza.');
  last=hit.cursor;
  const key=hit.publisherId+'/'+hit.record.id;
  assert(!ids.has(key),'El federador devolvió una ficha duplicada.');ids.add(key);
 }
 assert(Number.isSafeInteger(payload.cursor)&&payload.cursor>=cursor,'Cursor final inválido.');
 assert(payload.cursor===(hits.length?last:cursor),'Cursor inconsistente.');
 assert(typeof payload.hasMore==='boolean','Paginación inválida.');
 return {origin,results:hits,cursor:payload.cursor,hasMore:payload.hasMore};
}
async function verifyAndImport(hit,approve){
 assert(typeof approve==='function','Falta la autorización de clave institucional.');
 const checked=checkHit(originOf(hit.origin),hit);
 const feed=await fetchJson(checked.catalogUrl,FEED_BYTES);
 const verified=await core.verifyFeed(feed);
 assert(verified.feed.publisherId===checked.publisherId,'El catálogo firmado pertenece a otra institución.');
 const actual=verified.feed.records.find(r=>r.id===checked.record.id);
 assert(actual?.status==='published'&&core.canonical(actual)===core.canonical(checked.record),
  'El resultado del federador no coincide con el catálogo original firmado.');
 const imported=await local.importFeed(feed,approve);
 return {...imported,verifiedRecord:actual};
}
root.NexusMeshFederator=Object.freeze({originOf,search,verifyAndImport,checkHit});
})(globalThis);
