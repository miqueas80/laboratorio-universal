/* NEXUS-X: optional, read-public / curator-registered, D1-backed federation pilot.
 * Never required for offline inventory / Lens / IA. NOT deployed from this branch.
 */
import '../mesh/core.js';
import {createIngestionPlan,cleanQuery,pagination,FederationError} from './policy.mjs';

const MAX_FEED_BYTES=3*1024*1024;
const TENANT=/^ws-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SUBJECTS=new Set(globalThis.NexusMeshCore?.SUBJECTS||[]);
const LEVELS=new Set(globalThis.NexusMeshCore?.LEVELS||[]);
const headers={
 'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
 'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'",
 'Cross-Origin-Resource-Policy':'cross-origin'
};
function json(data,status=200,publicRead=false){
 return Response.json(data,{status,headers:{...headers,
  'Cache-Control':publicRead?'public, max-age=30, must-revalidate':'no-store',
  ...(publicRead?{'Access-Control-Allow-Origin':'*'}:{})}});
}
function fail(code,message,status=400){throw new FederationError(code,message,status);}
function isVerifiedPublisher(id){return TENANT.test(id||'');}
async function requestJson(req){
 const contentType=req.headers.get('content-type')||'';
 if(!/^application\/json(?:\s*;|$)/i.test(contentType))fail('CONTENT_TYPE','El federador acepta únicamente application/json.',415);
 const declared=Number(req.headers.get('content-length')||0);
 if(!Number.isSafeInteger(declared)||declared>MAX_FEED_BYTES)fail('LIMIT','Catálogo demasiado grande.',413);
 if(!req.body)fail('EMPTY_BODY','Falta el catálogo firmado.');
 const chunks=[];let count=0;
 const reader=req.body.getReader();
 try{
  while(true){
   const {value,done}=await reader.read();
   if(done)break;
   count+=value.byteLength;
   if(count>MAX_FEED_BYTES)fail('LIMIT','Catálogo demasiado grande.',413);
   chunks.push(value);
  }
 }finally{reader.releaseLock();}
 if(count===0)fail('EMPTY_BODY','Falta el catálogo firmado.');
 const buffer=new Uint8Array(count);let offset=0;
 for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.length;}
 let parsed;
 try{parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer));}
 catch{fail('INVALID_JSON','Catálogo JSON inválido.');}
 return parsed;
}
const prepare=(db,sql,...args)=>db.prepare(sql).bind(...args);
const jsonFields=record=>{
 const live=record.status==='published';
 return [record.publisherId,record.id,record.revision,record.status,
  JSON.stringify(record),
  live?record.title:'',live?record.summary:'',live?record.subject:'',
  live?record.level:'',live?record.license:'',live?record.attribution:'',
  live?record.keywords.join(' '):'',record.updatedAt];
};
async function ingest(request,env){
 const raw=await requestJson(request);
 // The server verifies Ed25519; a browser-provided "verified" flag has no authority.
 let verified;
 try{verified=await globalThis.NexusMeshCore.verifyFeed(raw);}
 catch{fail('BAD_SIGNATURE','Catálogo inválido, modificado o con firma no válida.',400);}
 const {feed}=verified;
 const db=env.DB;
 const school=await prepare(db,'SELECT publisher_id,public_key,active,epoch FROM publishers WHERE publisher_id=? LIMIT 1',feed.publisherId).first();
 const rows=await prepare(db,'SELECT resource_id,revision,record_json FROM resources WHERE publisher_id=? LIMIT 2001',feed.publisherId).all();
 const stored=await prepare(db,'SELECT public_key,signature FROM feeds WHERE publisher_id=? LIMIT 1',feed.publisherId).first();
 const plan=createIngestionPlan(verified,school,rows?.results||[],stored);
 if(plan.kind==='replay')return json({ok:true,kind:'replay',publisherId:plan.publisherId,accepted:0,unchanged:plan.unchanged,total:plan.total});
 // D1.batch is atomic. A compare-and-swap on epoch is the first statement;
 // SQLite constraints/triggers enforce authorization and revision at COMMIT as well.
 const statements=[
  prepare(db,'UPDATE publishers SET epoch=CASE WHEN epoch=? AND active=1 AND public_key=? THEN epoch+1 ELSE NULL END WHERE publisher_id=?',
   plan.expectedEpoch,feed.publicKey,feed.publisherId)
 ];
 const upsert='INSERT INTO resources(publisher_id,resource_id,revision,status,signer_public_key,record_json,title,summary,subject,level,license,attribution,keywords,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(publisher_id,resource_id) DO UPDATE SET revision=excluded.revision,status=excluded.status,signer_public_key=excluded.signer_public_key,record_json=excluded.record_json,title=excluded.title,summary=excluded.summary,subject=excluded.subject,level=excluded.level,license=excluded.license,attribution=excluded.attribution,keywords=excluded.keywords,updated_at=excluded.updated_at';
 for(const r of plan.actions){
  const fields=jsonFields(r);
  statements.push(prepare(db,upsert,...fields.slice(0,4),feed.publicKey,...fields.slice(4)));
 }
 statements.push(prepare(db,'INSERT INTO feeds(publisher_id,public_key,signature,feed_json) VALUES(?,?,?,?) ON CONFLICT(publisher_id) DO UPDATE SET public_key=excluded.public_key,signature=excluded.signature,feed_json=excluded.feed_json,updated_at=datetime(\'now\')',
  feed.publisherId,feed.publicKey,feed.signature,JSON.stringify(feed)));
 try{await db.batch(statements);}
 catch{fail('CONCURRENT_OR_REVOKED','Publicación rechazada: conflicto concurrente, permiso revocado o error de persistencia.',409);}
 return json({ok:true,kind:'commit',publisherId:feed.publisherId,accepted:plan.accepted,unchanged:plan.unchanged,total:plan.total});
}
async function catalogue(url,env){
 const id=url.pathname.slice('/api/v1/catalog/'.length);
 if(!isVerifiedPublisher(id))fail('INVALID_ID','Identificador institucional inválido.',400);
 const row=await prepare(env.DB,'SELECT f.feed_json FROM feeds f JOIN publishers p ON p.publisher_id=f.publisher_id WHERE f.publisher_id=? AND p.active=1 LIMIT 1',id).first();
 if(!row)return json({code:'NOT_FOUND',message:'Catálogo no publicado.'},404,true);
 return new Response(row.feed_json,{status:200,headers:{...headers,'Content-Type':'application/json; charset=utf-8',
  'Access-Control-Allow-Origin':'*','Cache-Control':'public, max-age=30, must-revalidate'}});
}
async function search(url,env){
 const {limit,cursor}=pagination(url),q=url.searchParams.get('q')||'';
 const subject=url.searchParams.get('subject')||'',level=url.searchParams.get('level')||'';
 if(subject&&!SUBJECTS.has(subject))fail('INVALID_SUBJECT','Materia inválida.');
 if(level&&!LEVELS.has(level))fail('INVALID_LEVEL','Nivel inválido.');
 const publisher=url.searchParams.get('publisherId')||'';
 if(publisher&&!isVerifiedPublisher(publisher))fail('INVALID_PUBLISHER','Institución inválida.');
 const clauses=['r.status=?','p.active=1','r.resource_rowid>?'];
 const params=['published',cursor];
 if(subject){clauses.push('r.subject=?');params.push(subject);}
 if(level){clauses.push('r.level=?');params.push(level);}
 if(publisher){clauses.push('r.publisher_id=?');params.push(publisher);}
 let from='resources r JOIN publishers p ON p.publisher_id=r.publisher_id';
 if(q){
  from='resource_fts JOIN resources r ON r.resource_rowid=resource_fts.rowid JOIN publishers p ON p.publisher_id=r.publisher_id';
  clauses.unshift('resource_fts MATCH ?');params.unshift(cleanQuery(q));
 }
 const stmt='SELECT r.resource_rowid,r.publisher_id,r.record_json FROM '+from+
  ' WHERE '+clauses.join(' AND ')+' ORDER BY r.resource_rowid ASC LIMIT ?';
 const found=await prepare(env.DB,stmt,...params,limit+1).all();
 const rows=found?.results||[],slice=rows.slice(0,limit),hasMore=rows.length>limit;
 const results=slice.map(({resource_rowid,publisher_id,record_json})=>({
  publisherId:publisher_id,catalogUrl:new URL('/api/v1/catalog/'+publisher_id,url.origin).href,
  record:JSON.parse(record_json),cursor:resource_rowid
 }));
 return json({schema:1,notice:'discovery_only_verify_signed_catalogue_before_trust',
  results,hasMore,cursor:slice.length?slice.at(-1).resource_rowid:cursor},200,true);
}
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(!env?.DB?.prepare||!env?.DB?.batch)return json({code:'NOT_CONFIGURED',message:'D1 no configurada.'},503);
  try{
   if(request.method==='GET'&&url.pathname==='/health')return json({ok:true,service:'nexus-federador-piloto',publicCatalogueOnly:true});
   if(request.method==='GET'&&url.pathname==='/api/v1/search')return await search(url,env);
   if(request.method==='GET'&&url.pathname.startsWith('/api/v1/catalog/'))return await catalogue(url,env);
   if(request.method==='POST'&&url.pathname==='/api/v1/ingest')return await ingest(request,env);
   if(url.pathname==='/api/v1/ingest'&&request.method==='OPTIONS')return json({code:'NO_BROWSER_WRITE',message:'No se habilita publicación CORS desde navegadores.'},405);
   return json({code:'NOT_FOUND',message:'Ruta o método no admitido.'},404);
  }catch(error){
   if(error instanceof FederationError)return json({code:error.code,message:error.message},error.status);
   // Never disclose SQL details, institutional records or stack traces.
   return json({code:'INTERNAL',message:'El federador no pudo completar la operación.'},500);
  }
 }
};
