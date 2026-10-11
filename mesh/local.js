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
const CATALOG_KEY='nexus-mesh:catalogue:'+scope;
const PINS_KEY='nexus-mesh:pins:'+scope;
const MAX_LOCAL=1500;
const LS=root.localStorage;
const clone=value=>JSON.parse(JSON.stringify(value));
function read(key,fall){try{const j=JSON.parse(LS.getItem(key)||'null');return j??fall;}catch{return fall;}}
function write(key,body){LS.setItem(key,JSON.stringify(body));}
function publisher(){if(!mesh.TENANT.test(activeId))throw Error('Creá o abrí un espacio institucional para publicar recursos.');return workspace.active();}
function own(){const rows=read(PUBLISH_KEY,[]);return Array.isArray(rows)?rows.filter(r=>{try{return mesh.validateRecord(r).publisherId===activeId;}catch{return false;}}):[];}
function external(){const rows=read(CATALOG_KEY,[]);return Array.isArray(rows)?rows.filter(r=>{try{mesh.validateRecord(r);return true;}catch{return false;}}):[];}
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
 const trust=pins(),current=trust[feed.publisherId];
 if(current&&current!==fingerprint)throw Error('ALERTA: la escuela cambió su clave de firma. No se importó ningún dato.');
 if(!current){
  const accepted=await approve({publisherId:feed.publisherId,fingerprint,count:feed.records.length});
  if(accepted!==true)throw Error('No se autorizó confiar en la identidad de esta escuela.');
 }
 const outcome=mesh.reconcile(external(),feed.records,activeId);
 if(outcome.records.length>MAX_LOCAL)throw Error('Catálogo local completo. Reducí los recursos importados.');
 if(outcome.conflicts.length)throw Error('Catálogo en conflicto: revisá cambios con la misma revisión. Nada fue sobrescrito.');
 // Pin and changes saved only after validation. A failed storage write means import failed.
 write(CATALOG_KEY,outcome.records);
 if(!current)write(PINS_KEY,{...trust,[feed.publisherId]:fingerprint});
 return {publisherId:feed.publisherId,fingerprint,...outcome,live:outcome.records.filter(r=>r.status==='published').length};
}
function clearExternal(){
 throw Error('El borrado masivo de catálogos no está habilitado. Contactá al administrador de la instalación.');
}
root.NexusMeshLocal=Object.freeze({scope,activeId,publisher,own,external,all,search,publish,withdraw,exportFeed,importFeed,identity,pins,clearExternal});
})(globalThis);
