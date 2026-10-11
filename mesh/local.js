/* NEXUS-X — Local-first signed school mesh catalogue storage.
 * No school binary files, inventories or local indexed text leave this module.
 */
(function(root){
'use strict';
const mesh=root.NexusMeshCore;
if(!mesh)return;
const scope=encodeURIComponent(new URL('./',root.location.href).pathname);
const workspace=root.NexusWorkspaces;
const activeId=workspace?.activeId||'personal';
const PUBLISH_KEY='nexus-mesh:published:'+scope+':'+activeId;
// Legacy cross-school flattened catalogue is NOT imported implicitly: it has no
// retained signature, so it cannot be safely displayed as verified material.
const FEEDS_KEY='nexus-mesh:verified-feeds-v2:'+scope+':'+activeId;
const PINS_KEY='nexus-mesh:pins-v2:'+scope+':'+activeId;
const MAX_CACHE_BYTES=2800*1024;
const MAX_LOCAL=1500;
const LS=root.localStorage;
function read(key,fall){try{const j=JSON.parse(LS.getItem(key)||'null');return j??fall;}catch{return fall;}}
function write(key,body){LS.setItem(key,JSON.stringify(body));}
function publisher(){if(!mesh.TENANT.test(activeId))throw Error('Creá o abrí un espacio institucional para publicar recursos.');return workspace.active();}
function own(){const rows=read(PUBLISH_KEY,[]);return Array.isArray(rows)?rows.filter(r=>{try{return mesh.validateRecord(r).publisherId===activeId;}catch{return false;}}):[];}
function feeds(){
 const raw=read(FEEDS_KEY,{});
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return {};
 return raw;
}
function external(){
 // Synchronous compatibility view. Actual user-facing searches MUST call searchVerified()
 // to check the Ed25519 signatures before displaying any external material.
 const rows=[];
 for(const [publisherId,feed] of Object.entries(feeds())){
  if(!mesh.TENANT.test(publisherId)||feed?.publisherId!==publisherId||!Array.isArray(feed.records))continue;
  for(const raw of feed.records){
   try{const rec=mesh.validateRecord(raw);if(rec.publisherId===publisherId)rows.push(rec);}catch{}
  }
 }
 return rows;
}
function pins(){const p=read(PINS_KEY,{});return p&&typeof p==='object'&&!Array.isArray(p)?p:{};}
function keyDb(){
 const name='NEXUS_X_MESH_SIGNING_V1_'+scope+'_'+activeId;
 return new Promise((resolve,reject)=>{
  const req=root.indexedDB.open(name,1);
  req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('keys'))req.result.createObjectStore('keys',{keyPath:'id'});};
  req.onerror=()=>reject(Error('No se puede crear el almacenamiento privado de firma.'));
  req.onsuccess=()=>resolve(req.result);
 });
}
async function identity({allowCreate=false}={}){
 publisher();
 const db=await keyDb();
 try{
  let stored=await new Promise((resolve,reject)=>{
   const tx=db.transaction('keys','readonly'),r=tx.objectStore('keys').get('institution');
   r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);
  });
  if(stored?.privateKey&&stored.publicKeyRaw)return stored;
  if(!allowCreate)throw Error('La escuela todavía no generó su identidad de firma. Publicá un recurso para crearla.');
  const generated=await mesh.createIdentity();
  stored={id:'institution',privateKey:generated.privateKey,publicKeyRaw:generated.publicKeyRaw};
  await new Promise((resolve,reject)=>{
   const tx=db.transaction('keys','readwrite');
   tx.objectStore('keys').add(stored);
   tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||Error('No se pudo conservar la clave privada.'));tx.onerror=()=>reject(tx.error);
  });
  return stored;
 }finally{db.close();}
}
function validateRights(rights){
 if(rights?.ownerConfirmed!==true||rights?.noPersonalDataConfirmed!==true)throw Error('Confirmá titularidad, licencia y ausencia de datos personales antes de publicar.');
}
function publish(info,rights){
 const school=publisher();
 validateRights(rights);
 if(!root.crypto?.randomUUID)throw Error('El navegador no permite generar IDs seguros.');
 const rows=own();if(rows.length>=MAX_LOCAL)throw Error('Límite del catálogo local alcanzado.');
 const id='doc-'+root.crypto.randomUUID();
 const record=mesh.newRecord(info,activeId,school.name,id);
 // This only publishes metadata locally. Export is a separate user action.
 write(PUBLISH_KEY,[...rows,record]);
 return record;
}
function withdraw(id){
 publisher();
 const records=own(),index=records.findIndex(x=>x.id===id);
 if(index<0)throw Error('No se encontró un documento propio para retirar.');
 const next=mesh.withdrawn(records[index]);
 records[index]=next;write(PUBLISH_KEY,records);
 return next;
}
function all(){
 const trustedExternal=external().filter(r=>r.publisherId!==activeId);
 return [...own(),...trustedExternal];
}
function search(term,filters){return mesh.queryRecords(all(),term,filters);}
async function searchVerified(term,filters){
 // Offline verification of the actual signed catalogue, not a mutable flattened
 // localStorage cache. Any corrupted signature fails CLOSED (UI keeps own files).
 const registry=root.NexusMeshRegistry;
 const authorized=registry?await registry.trustSnapshot():null;
 const accepted=[],trust=pins();
 const stored=feeds();
 for(const [publisherId,raw] of Object.entries(stored)){
  const {feed,fingerprint}=await mesh.verifyFeed(raw);
  if(publisherId!==feed.publisherId||publisherId===activeId)
   throw Error('Catálogo almacenado con identidad de institución inconsistente.');
  if(trust[publisherId]!==fingerprint)
   throw Error('Catálogo almacenado sin huella de firma previamente autorizada.');
  const attestation=authorized?.[publisherId];
  if(attestation&&(attestation.status!=='active'||attestation.publicKey!==feed.publicKey))continue;
  accepted.push(...feed.records);
 }
 return mesh.queryRecords([...own(),...accepted],term,filters);
}
async function exportFeed(){
 publisher();
 const keys=await identity({allowCreate:true});
 return mesh.signFeed(activeId,own(),keys);
}
async function importFeed(source,approve){
 if(typeof approve!=='function')throw Error('Se requiere revisión humana de la identidad de origen.');
 // Signature verification MUST happen before trusting any feed or metadata.
 const {feed,fingerprint}=await mesh.verifyFeed(source);
 if(feed.publisherId===activeId)throw Error('No importes un catálogo propio: este espacio es el editor local.');
 // A pinned, signed authority can attest to institutions without trusting unverified UUIDs.
 // Suspensions and mismatched school keys always fail closed, even if the school was previously pinned.
 const authority=root.NexusMeshRegistry?await root.NexusMeshRegistry.checkPublisher(feed.publisherId,feed.publicKey):'unknown';
 const trust=pins(),current=trust[feed.publisherId];
 if(current&&current!==fingerprint)throw Error('ALERTA: la escuela cambió su clave de firma. No se importó ningún dato.');
 if(!current&&authority!=='verified'){
  const accepted=await approve({publisherId:feed.publisherId,fingerprint,count:feed.records.length});
  if(accepted!==true)throw Error('No se autorizó confiar en la identidad de esta escuela.');
 }
 const stored=feeds(),old=stored[feed.publisherId]||null;
 let previous=[];
 if(old){
  const checked=await mesh.verifyFeed(old);
  if(checked.feed.publisherId!==feed.publisherId||checked.fingerprint!==fingerprint)
   throw Error('El catálogo firmado anterior no coincide con la institución fijada.');
  previous=checked.feed.records;
 }
 // Snapshots MUST retain withdrawn IDs (tombstones): omissions or stale revisions
 // cannot erase a history of signed withdrawals or silently undo newer data.
 const incoming=new Map(feed.records.map(r=>[r.id,r]));
 for(const row of previous){
  const next=incoming.get(row.id);
  if(!next)throw Error('Catálogo incompleto: faltan avisos de retiro firmados.');
  if(next.revision<row.revision)throw Error('Catálogo antiguo: no se permite retroceder revisiones.');
  if(row.status==='withdrawn'&&next.status==='published')
   throw Error('No se puede reactivar un ID previamente retirado.');
 }
 const outcome=mesh.reconcile(previous,feed.records,activeId);
 if(outcome.conflicts.length)throw Error('Catálogo en conflicto: revisiones idénticas con contenidos distintos.');
 const changed={...stored,[feed.publisherId]:feed};
 const count=Object.values(changed).reduce((total,entry)=>total+(entry?.records?.length||0),0);
 if(count>MAX_LOCAL)throw Error('Límite local de 1.500 fichas firmadas. No se modificó nada.');
 if(new TextEncoder().encode(JSON.stringify(changed)).length>MAX_CACHE_BYTES)
  throw Error('Los catálogos firmados exceden 2,8 MB de caché opcional.');
 // A partial storage failure never makes forged data readable: searchVerified()
 // requires BOTH a valid signature AND the previously accepted key fingerprint.
 if(!current)write(PINS_KEY,{...trust,[feed.publisherId]:fingerprint});
 write(FEEDS_KEY,changed);
 return {publisherId:feed.publisherId,fingerprint,...outcome,
  live:Object.values(changed).flatMap(entry=>entry.records).filter(r=>r.status==='published').length};
}
function clearExternal(){
 throw Error('El borrado masivo de catálogos no está habilitado. Contactá al administrador de la instalación.');
}
root.NexusMeshLocal=Object.freeze({scope,activeId,publisher,own,external,all,search,searchVerified,publish,withdraw,exportFeed,importFeed,identity,pins,clearExternal});
})(globalThis);
