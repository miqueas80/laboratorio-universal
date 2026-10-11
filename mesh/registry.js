/* NEXUS-X — optional signed school-authority registry (experimental).
 * Explicit authority pinning. No network calls. Not a government endorsement.
 * Inspired by TUF rollback/freeze protection, but NOT a TUF implementation.
 */
(function(root){
'use strict';
const core=root.NexusMeshCore;
if(!core)return;
const FORMAT='NEXUS-REGISTRY-1',SCHEMA=1,MAX_SCHOOLS=500,MAX_BYTES=512*1024;
const MAX_AGE=90*24*60*60*1000,MAX_CLOCK_SKEW=5*60*1000;
const workspace=root.NexusWorkspaces?.activeId||'personal';
const KEY='nexus-mesh:trusted-authority:'+encodeURIComponent(new URL('./',root.location.href).pathname)+':'+workspace;
const B64=/^[A-Za-z0-9_-]+$/;
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const exact=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length===keys.length&&Object.keys(o).every(k=>keys.includes(k));
const b64decode=s=>{
 assert(typeof s==='string'&&B64.test(s)&&s.length<=200,'Codificación de clave o firma inválida.');
 const text=atob(s.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(s.length/4)*4,'='));
 return Uint8Array.from(text,ch=>ch.charCodeAt(0));
};
const b64encode=bytes=>{
 let raw='';for(const x of bytes)raw+=String.fromCharCode(x);
 return btoa(raw).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
};
function iso(raw,label){
 assert(typeof raw==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(raw),'Fecha inválida: '+label);
 const time=Date.parse(raw);
 assert(Number.isFinite(time)&&new Date(time).toISOString()===raw,'Fecha no válida: '+label);
 return time;
}
function validate(record){
 assert(exact(record,['format','schema','sequence','authorityName','publicKey','issuedAt','expiresAt','institutions','signature']),'Registro institucional: esquema incorrecto.');
 assert(record.format===FORMAT&&record.schema===SCHEMA,'Versión de registro incompatible.');
 assert(Number.isSafeInteger(record.sequence)&&record.sequence>=1,'Secuencia de registro inválida.');
 assert(typeof record.authorityName==='string'&&record.authorityName.length<=110&&record.authorityName.trim()===record.authorityName&&record.authorityName.length>=3,'Nombre de autoridad inválido.');
 assert(!/[\u0000-\u001f<>]/.test(record.authorityName),'Nombre de autoridad inválido.');
 const issued=iso(record.issuedAt,'publicación'),expires=iso(record.expiresAt,'vencimiento');
 assert(expires>issued&&expires-issued<=MAX_AGE,'Registro debe vencer dentro de 90 días.');
 assert(b64decode(record.publicKey).length===32&&b64decode(record.signature).length===64,'Clave o firma Ed25519 inválida.');
 assert(Array.isArray(record.institutions)&&record.institutions.length<=MAX_SCHOOLS,'Registro demasiado grande.');
 const ids=new Set(),institutions=[];
 for(const inst of record.institutions){
  assert(exact(inst,['publisherId','name','publicKey','status']),'Institución: esquema incorrecto.');
  assert(core.TENANT.test(inst.publisherId)&&!ids.has(inst.publisherId),'Identificador institucional repetido o inválido.');
  ids.add(inst.publisherId);
  assert(typeof inst.name==='string'&&inst.name.trim()===inst.name&&inst.name.length>=3&&inst.name.length<=110&&!/[\u0000-\u001f<>]/.test(inst.name),'Nombre de institución inválido.');
  assert(b64decode(inst.publicKey).length===32,'Clave de institución inválida.');
  assert(['active','suspended'].includes(inst.status),'Estado institucional inválido.');
  institutions.push({publisherId:inst.publisherId,name:inst.name,publicKey:inst.publicKey,status:inst.status});
 }
 assert(new TextEncoder().encode(core.canonical(record)).length<=MAX_BYTES,'Registro supera 512 KiB.');
 return {format:FORMAT,schema:SCHEMA,sequence:record.sequence,authorityName:record.authorityName,
  publicKey:record.publicKey,issuedAt:record.issuedAt,expiresAt:record.expiresAt,institutions,signature:record.signature};
}
function signedData(record){
 const {signature,...unsigned}=record;
 return new TextEncoder().encode(core.canonical(unsigned));
}
async function verify(input){
 const registry=validate(input);
 let key;
 try{key=await root.crypto.subtle.importKey('raw',b64decode(registry.publicKey),{name:'Ed25519'},false,['verify']);}
 catch{throw Error('Clave de autoridad inválida.');}
 const valid=await root.crypto.subtle.verify('Ed25519',key,b64decode(registry.signature),signedData(registry));
 assert(valid,'Firma de registro de escuelas inválida.');
 return {registry,fingerprint:await core.fingerprint(registry.publicKey)};
}
async function sign(unsigned,identity){
 assert(identity?.privateKey?.algorithm?.name==='Ed25519','La autoridad requiere una clave de firma Ed25519 propia.');
 const draft={...unsigned,format:FORMAT,schema:SCHEMA,publicKey:identity.publicKeyRaw,signature:b64encode(new Uint8Array(64))};
 const valid=validate(draft);
 const signature=b64encode(new Uint8Array(await root.crypto.subtle.sign('Ed25519',identity.privateKey,signedData(valid))));
 return validate({...valid,signature});
}
function saved(){
 try{
  const data=JSON.parse(root.localStorage.getItem(KEY)||'null');
  if(!data||!exact(data,['registry','fingerprint']))return null;
  return data;
 }catch{return null;}
}
async function validatedSaved(){
 const existing=saved();
 if(!existing){
  // Treat malformed or partially erased authority storage as unsafe, NOT as "no registry".
  if(root.localStorage.getItem(KEY)!==null)throw Error('Registro institucional almacenado está dañado. No se puede confiar en fichas externas.');
  return null;
 }
 const signed=await verify(existing.registry);
 assert(signed.fingerprint===existing.fingerprint,'El registro local está alterado.');
 return signed;
}
async function install(input,approve){
 assert(typeof approve==='function','La autoridad requiere revisión humana de huella digital.');
 const verified=await verify(input),next=verified.registry,now=Date.now();
 const issue=iso(next.issuedAt,'publicación'),exp=iso(next.expiresAt,'vencimiento');
 assert(issue<=now+MAX_CLOCK_SKEW,'El registro está fechado en el futuro.');
 assert(exp>now,'El registro de autoridad venció. Solicitá uno reciente.');
 const old=await validatedSaved();
 if(old){
  assert(old.fingerprint===verified.fingerprint,'ALERTA: cambió la clave de la autoridad. Se requiere migración manual segura.');
  assert(next.sequence>=old.registry.sequence,'ALERTA: versión de autoridad antigua. Posible ataque de retroceso.');
  if(next.sequence===old.registry.sequence){
   assert(core.canonical(next)===core.canonical(old.registry),'Misma revisión institucional con contenido distinto.');
   return {updated:false,sequence:next.sequence,fingerprint:verified.fingerprint,institutions:next.institutions.length};
  }
 }else{
  const accepted=await approve({authorityName:next.authorityName,fingerprint:verified.fingerprint,
   sequence:next.sequence,institutions:next.institutions.length});
  assert(accepted===true,'No se aprobó la autoridad. Confirmá la huella por un canal independiente.');
 }
 root.localStorage.setItem(KEY,JSON.stringify({registry:next,fingerprint:verified.fingerprint}));
 return {updated:true,sequence:next.sequence,fingerprint:verified.fingerprint,institutions:next.institutions.length};
}
async function checkPublisher(id,publicKey){
 const registered=await validatedSaved();
 if(!registered)return 'unknown';
 const entry=registered.registry.institutions.find(row=>row.publisherId===id);
 if(!entry)return 'unknown';
 assert(entry.status==='active','Escuela suspendida por el registro de confianza.');
 assert(entry.publicKey===publicKey,'ALERTA: la clave de la escuela no coincide con el registro de autoridad.');
 const now=Date.now();
 assert(iso(registered.registry.expiresAt,'vencimiento')>now,
  'Registro institucional vencido. Actualizalo antes de importar materiales de esta escuela.');
 return 'verified';
}
async function trustSnapshot(){
 // Verification on every explicit search also detects changes made by another tab.
 const found=await validatedSaved();
 if(!found)return null;
 const expired=iso(found.registry.expiresAt,'vencimiento')<=Date.now();
 const entries=Object.create(null);
 for(const entry of found.registry.institutions){
  entries[entry.publisherId]={publicKey:entry.publicKey,status:expired?'expired':entry.status};
 }
 return entries;
}
function info(){
 const current=saved();
 if(!current)return null;
 return {authorityName:current.registry.authorityName,
  sequence:current.registry.sequence,expiresAt:current.registry.expiresAt,
  fingerprint:current.fingerprint,institutions:current.registry.institutions.length};
}
root.NexusMeshRegistry=Object.freeze({FORMAT,validate,verify,sign,install,checkPublisher,trustSnapshot,info});
})(globalThis);
