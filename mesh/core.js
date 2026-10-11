/* NEXUS-X — Malla Federal Educativa v1: signed metadata only.
 * No inventory, student data, document body, OAuth token or Drive credentials.
 * Fingerprints are trust-on-first-use until a trusted national identity registry exists.
 */
(function(root){
'use strict';
const VERSION=1,FORMAT='NEXUS-MESH-1',MAX_FEED=2000,MAX_BYTES=3*1024*1024;
const TENANT=/^ws-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DOC=/^doc-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const LICENSES=Object.freeze({'CC0':'https://creativecommons.org/publicdomain/zero/1.0/','CC-BY-4.0':'https://creativecommons.org/licenses/by/4.0/','CC-BY-SA-4.0':'https://creativecommons.org/licenses/by-sa/4.0/','CC-BY-NC-4.0':'https://creativecommons.org/licenses/by-nc/4.0/'});
const LEVELS=new Set(['primaria','secundaria','tecnica','superior','formacion-docente']);
const SUBJECTS=new Set(['biologia','quimica','fisica','matematicas','tecnologia','informatica','lengua','historia','geografia','ambiente','otras']);
const ATTR=['schema','id','revision','status','publisherId','publisherName','title','summary','subject','level','license','attribution','accessUrl','updatedAt','keywords'];
const WITHDRAW=['schema','id','revision','status','publisherId','updatedAt'];
const FEED_KEYS=['format','schema','publisherId','publicKey','records','signature'];
const SECRET_MARKERS=/\b(?:dni|cuil|cuit|legajo|matr[ií]cula|alumno|estudiante|paciente|tel[eé]fono|domicilio|historia cl[ií]nica)\b/i;
const EMAIL=/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const assert=(x,m)=>{if(!x)throw Error(m);};
const isObject=x=>x&&typeof x==='object'&&!Array.isArray(x);
const exact=(obj,keys)=>isObject(obj)&&Object.keys(obj).length===keys.length&&Object.keys(obj).every(k=>keys.includes(k));
const clean=(v,label,max=240)=>{
 assert(typeof v==='string'&&v===v.trim()&&v.length>0&&v.length<=max,'Campo inválido: '+label);
 assert(!/[\u0000-\u001f\u007f<>]/.test(v),'Control o etiquetas no permitidas en '+label);
 return v;
};
const date=v=>{assert(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)&&!Number.isNaN(Date.parse(v)),'Marca temporal inválida.');return v;};
const bytes=x=>new TextEncoder().encode(x).length;
const b64url=u8=>{
 let s='';for(let i=0;i<u8.length;i++)s+=String.fromCharCode(u8[i]);
 return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
};
const unbase=s=>{
 assert(typeof s==='string'&&/^[A-Za-z0-9_-]+$/.test(s)&&s.length<=200,'Clave o firma inválida.');
 const normalized=s.replace(/-/g,'+').replace(/_/g,'/');
 const value=atob(normalized.padEnd(Math.ceil(normalized.length/4)*4,'='));
 return Uint8Array.from(value,c=>c.charCodeAt(0));
};
const canonical=value=>{
 if(value===null||typeof value==='boolean'||typeof value==='string')return JSON.stringify(value);
 if(typeof value==='number'){assert(Number.isFinite(value),'Número inválido.');return JSON.stringify(value);}
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 assert(isObject(value),'Objeto inválido.');
 const keys=Object.keys(value).sort();
 for(const k of keys)assert(!['__proto__','constructor','prototype'].includes(k),'Clave prohibida.');
 return '{'+keys.map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
};
function validateRecord(record){
 assert(isObject(record),'Entrada del catálogo inválida.');
 assert(record.schema===VERSION,'Versión del catálogo inválida.');
 assert(DOC.test(record.id),'ID del recurso inválido.');
 assert(TENANT.test(record.publisherId),'Institución inválida.');
 assert(Number.isSafeInteger(record.revision)&&record.revision>=1,'Revisión inválida.');
 assert(['published','withdrawn'].includes(record.status),'Estado inválido.');
 date(record.updatedAt);
 if(record.status==='withdrawn'){
  assert(exact(record,WITHDRAW),'Retiro: esquema inválido.');
  return JSON.parse(canonical(record));
 }
 assert(exact(record,ATTR),'Publicación: esquema inválido.');
 clean(record.publisherName,'escuela',100);
 clean(record.title,'título',180);
 clean(record.summary,'resumen',500);
 clean(record.attribution,'autoría',160);
 assert(!EMAIL.test([record.publisherName,record.title,record.summary,record.attribution].join(' '))&&!SECRET_MARKERS.test([record.title,record.summary,record.attribution].join(' ')),'Posibles datos personales: revisá el título, descripción y autoría.');
 assert(LEVELS.has(record.level)&&SUBJECTS.has(record.subject),'Nivel o materia inválida.');
 assert(Object.hasOwn(LICENSES,record.license),'Licencia de reutilización no reconocida.');
 assert(Array.isArray(record.keywords)&&record.keywords.length<=8,'Etiquetas inválidas.');
 const seen=new Set();for(const kw of record.keywords){clean(kw,'etiqueta',32);assert(!EMAIL.test(kw)&&!SECRET_MARKERS.test(kw),'Etiqueta potencialmente privada.');const k=kw.toLocaleLowerCase('es');assert(!seen.has(k),'Etiquetas duplicadas.');seen.add(k);}
 clean(record.accessUrl,'enlace',600);
 let url;try{url=new URL(record.accessUrl);}catch{throw Error('Enlace inválido.');}
 assert(url.protocol==='https:'&&!url.username&&!url.password&&!url.hash&&!url.search&&!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(url.hostname),'Publicá una dirección HTTPS limpia, sin parámetros, fragmentos ni contraseñas.');
 assert(!['localhost','127.0.0.1','0.0.0.0','::1'].includes(url.hostname),'Enlace privado no admitido.');
 assert(url.href===record.accessUrl,'Usá un enlace HTTPS canónico.');
 assert(bytes(canonical(record))<=4096,'Metadatos demasiado grandes.');
 return JSON.parse(canonical(record));
}
function validateFeed(feed){
 assert(exact(feed,FEED_KEYS),'Formato de malla incorrecto.');
 assert(feed.format===FORMAT&&feed.schema===VERSION&&TENANT.test(feed.publisherId),'Encabezado de malla inválido.');
 assert(Array.isArray(feed.records)&&feed.records.length<=MAX_FEED,'Lote de malla demasiado grande.');
 const publicBytes=unbase(feed.publicKey),signatureBytes=unbase(feed.signature);
 assert(publicBytes.length===32&&signatureBytes.length===64,'Firma Ed25519 inválida.');
 const ids=new Set();
 const records=feed.records.map(validateRecord);
 for(const r of records){assert(r.publisherId===feed.publisherId,'La malla contiene recursos de otra institución.');assert(!ids.has(r.id),'Recurso duplicado en el mismo lote.');ids.add(r.id);}
 assert(bytes(canonical(feed))<=MAX_BYTES,'Catálogo supera el máximo permitido.');
 return {format:FORMAT,schema:VERSION,publisherId:feed.publisherId,publicKey:feed.publicKey,records,signature:feed.signature};
}
const signingData=feed=>new TextEncoder().encode(canonical({format:feed.format,schema:feed.schema,publisherId:feed.publisherId,publicKey:feed.publicKey,records:feed.records}));
function cryptoProvider(){const provider=root.crypto?.subtle;assert(provider,'WebCrypto no disponible. Requiere HTTPS y navegador compatible con Ed25519.');return provider;}
async function createIdentity(){
 const subtle=cryptoProvider();
 const keys=await subtle.generateKey({name:'Ed25519'},false,['sign','verify']);
 const raw=new Uint8Array(await subtle.exportKey('raw',keys.publicKey));
 return {privateKey:keys.privateKey,publicKey:keys.publicKey,publicKeyRaw:b64url(raw)};
}
async function fingerprint(publicKey){
 const raw=unbase(publicKey);assert(raw.length===32,'Clave pública inválida.');
 return b64url(new Uint8Array(await cryptoProvider().digest('SHA-256',raw)));
}
async function signFeed(tenantId,records,identity){
 assert(TENANT.test(tenantId),'Institución de origen inválida.');
 assert(identity?.privateKey?.algorithm?.name==='Ed25519','Clave de firma no disponible.');
 const items=records.map(validateRecord).sort((a,b)=>a.id.localeCompare(b.id));
 assert(items.length<=MAX_FEED&&items.every(r=>r.publisherId===tenantId),'No se pueden exportar datos de otra institución.');
 const draft={format:FORMAT,schema:VERSION,publisherId:tenantId,publicKey:identity.publicKeyRaw,records:items};
 const signature=b64url(new Uint8Array(await cryptoProvider().sign('Ed25519',identity.privateKey,signingData(draft))));
 return validateFeed({...draft,signature});
}
async function verifyFeed(raw){
 const feed=validateFeed(raw);
 let key;try{key=await cryptoProvider().importKey('raw',unbase(feed.publicKey),{name:'Ed25519'},false,['verify']);}catch{throw Error('Clave institucional inválida.');}
 const valid=await cryptoProvider().verify('Ed25519',key,unbase(feed.signature),signingData(feed));
 assert(valid,'Firma digital incorrecta: catálogo alterado o falsificado.');
 return {feed,fingerprint:await fingerprint(feed.publicKey)};
}
function reconcile(existing,incoming,ownerId=''){
 assert(Array.isArray(existing)&&Array.isArray(incoming),'Catálogos inválidos.');
 const map=new Map(existing.map(rec=>{const r=validateRecord(rec);return [r.publisherId+'/'+r.id,r]}));
 let accepted=0,stale=0,identical=0;const conflicts=[];
 for(const raw of incoming){
  const next=validateRecord(raw);
  if(next.publisherId===ownerId){conflicts.push({id:next.id,reason:'LOCAL_OWNER_PROTECTED'});continue;}
  const key=next.publisherId+'/'+next.id,old=map.get(key);
  if(!old||next.revision>old.revision){map.set(key,next);accepted++;continue;}
  if(next.revision<old.revision){stale++;continue;}
  if(canonical(next)===canonical(old)){identical++;continue;}
  conflicts.push({id:next.id,reason:'SAME_REVISION_DIVERGED'});
 }
 return {records:[...map.values()],accepted,stale,identical,conflicts};
}
function queryRecords(records,q,{subject='',level='',limit=80}={}){
 const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 const terms=normalize(q).split(/\s+/).filter(Boolean).slice(0,12);
 assert(Number.isSafeInteger(limit)&&limit>0&&limit<=200,'Paginación inválida.');
 return records.filter(r=>r.status==='published'&&(!subject||subject===r.subject)&&(!level||level===r.level))
 .map(r=>{
  const title=normalize(r.title),keywords=normalize(r.keywords.join(' ')),text=normalize(r.summary+' '+r.subject+' '+r.level+' '+r.publisherName+' '+r.attribution);
  let score=0;
  for(const term of terms){
   if(title.includes(term))score+=7;
   else if(keywords.includes(term))score+=5;
   else if(text.includes(term))score+=2;
   else return null;
  }
  return {record:r,score};
 }).filter(Boolean)
 .sort((a,b)=>b.score-a.score||a.record.title.localeCompare(b.record.title,'es')||a.record.id.localeCompare(b.record.id)).slice(0,limit).map(x=>x.record);
}
function newRecord(input,publisherId,publisherName,docId,revision=1,now=new Date().toISOString()){
 const record={schema:VERSION,id:docId,revision,status:'published',publisherId,publisherName,
 title:String(input.title||'').trim(),summary:String(input.summary||'').trim(),
 subject:input.subject,level:input.level,license:input.license,
 attribution:String(input.attribution||'').trim(),accessUrl:String(input.accessUrl||'').trim(),
 updatedAt:now,keywords:String(input.keywords||'').split(',').map(x=>x.trim()).filter(Boolean)};
 return validateRecord(record);
}
function withdrawn(record,now=new Date().toISOString()){
 const r=validateRecord(record);
 assert(r.status==='published','Recurso ya retirado.');
 return validateRecord({schema:VERSION,id:r.id,revision:r.revision+1,status:'withdrawn',publisherId:r.publisherId,updatedAt:now});
}
root.NexusMeshCore=Object.freeze({FORMAT,LICENSES,LEVELS:[...LEVELS],SUBJECTS:[...SUBJECTS],
 TENANT,DOC,validateRecord,validateFeed,createIdentity,fingerprint,signFeed,verifyFeed,
 reconcile,queryRecords,newRecord,withdrawn,canonical});
})(globalThis);
