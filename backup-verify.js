/* NEXUS-X offline institutional backup verifier, independent from inventory writes.
 * Pure read-only validation of untrusted ZIP archives. No networking or storage access.
 */
(function(root){
 'use strict';
 const FORMAT='nexus-x-institutional-backup', MAX_INPUT=160*1024*1024,
  MAX_DATA=64*1024*1024,MAX_ORIGINAL=128*1024*1024,MAX_DOCS=3000;
 const sha256=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),
  x=>x.toString(16).padStart(2,'0')).join('');
 const expect=(ok,message)=>{if(!ok)throw new Error('Respaldo inválido: '+message);};
 const positiveSize=x=>Number.isSafeInteger(x)&&x>=0;
 const zipSize=entry=>{
  const n=entry?._data?.uncompressedSize;
  return Number.isSafeInteger(n)&&n>=0?n:null;
 };
 async function verify(file,JSZip,{maxBytes=MAX_INPUT}={}){
  expect(file && Number.isFinite(file.size)&&file.size>0&&file.size<=maxBytes,'archivo ZIP vacío o demasiado grande');
  expect(globalThis.crypto?.subtle,'verificación SHA-256 no disponible');
  const zip=await JSZip.loadAsync(file,{checkCRC32:false});
  const names=Object.keys(zip.files).filter(name=>!zip.files[name].dir);
  expect(names.includes('nexus-x-data.json')&&names.includes('nexus-x-integrity.json'),'faltan archivos esenciales');
  expect(names.length<=MAX_DOCS+2,'contiene demasiados archivos');
  expect(names.every(n=>n==='nexus-x-data.json'||n==='nexus-x-integrity.json'||/^originales\/\d{5}\.bin$/.test(n)),
   'contiene rutas inesperadas o potencialmente inseguras');
  const dataFile=zip.file('nexus-x-data.json'),proofFile=zip.file('nexus-x-integrity.json');
  expect(zipSize(dataFile)!==null&&zipSize(dataFile)<=MAX_DATA,'datos descomprimidos demasiado grandes');
  expect(zipSize(proofFile)!==null&&zipSize(proofFile)<=16*1024,'metadatos de integridad demasiado grandes');
  const raw=await dataFile.async('uint8array');
  const hash=await sha256(raw);
  let data,proof;
  try{
   data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
   proof=JSON.parse(await proofFile.async('text'));
  }catch{throw new Error('Respaldo inválido: JSON de datos o integridad corrupto');}
  expect(data?.format===FORMAT&&data.schemaVersion===1,'formato o versión no compatible');
  expect(proof?.schemaVersion===1&&/^[a-f0-9]{64}$/.test(proof.dataSha256),
   'registro de integridad no válido');
  expect(proof.dataSha256===hash,'SHA-256 del inventario y metadatos no coincide');
  expect(Array.isArray(data.inventory)&&Array.isArray(data.documents)&&data.documents.length<=MAX_DOCS,
   'inventario o lista documental corruptos');
  expect(Array.isArray(data.calendar)&&Array.isArray(data.favorites),'calendario o favoritos no válidos');
  expect(data.inventory.length<=9999,'inventario supera el límite de IDs NEXUS-X');
  const ids=new Set();
  for(const row of data.inventory){
   expect(row&&typeof row==='object'&&!Array.isArray(row),'registro de inventario corrupto');
   expect(/^NEXUS-X-\d{4}$/.test(row.id)&&typeof row.name==='string'&&row.name.trim(),
    'identidad o nombre del inventario no válido');
   expect(!ids.has(row.id),'IDs duplicados');
   ids.add(row.id);
  }
  const paths=new Set(), originals=new Set();let originalBytes=0,withOriginal=0,withoutOriginal=0;
  for(const doc of data.documents){
   expect(doc&&typeof doc==='object'&&!Array.isArray(doc),'documento corrupto');
   expect(typeof doc.path==='string'&&doc.path.length>0&&doc.path.length<=1024,
    'ruta documental no válida');
   expect(!paths.has(doc.path),'ruta documental duplicada');
   paths.add(doc.path);
   if(doc.original===null){withoutOriginal++;continue;}
   const o=doc.original;
   expect(o&&typeof o==='object'&&/^originales\/\d{5}\.bin$/.test(o.archivePath),
    'ruta de original no válida');
   expect(!originals.has(o.archivePath),'archivo original reutilizado');
   originals.add(o.archivePath);
   expect(positiveSize(o.size)&&/^[a-f0-9]{64}$/.test(o.sha256),'tamaño o hash de original corrupto');
   const entry=zip.file(o.archivePath);
   expect(Boolean(entry)&&zipSize(entry)===o.size,'archivo original faltante o tamaño incompatible');
   originalBytes+=o.size;withOriginal++;
   expect(originalBytes<=MAX_ORIGINAL,'originales exceden 128 MiB');
   const bytes=await entry.async('uint8array');
   expect(bytes.length===o.size&&await sha256(bytes)===o.sha256,'SHA-256 de archivo original incorrecto');
  }
  expect(proof.originals===withOriginal&&proof.originalsUnavailable===withoutOriginal
   &&proof.originalBytes===originalBytes,'contador de originales inconsistente');
  expect(names.length===originals.size+2,'archivos extra o no referenciados');
  return {
   valid:true,data,zip,summary:{
    records:data.inventory.length,documents:data.documents.length,originals:withOriginal,
    originalsUnavailable:withoutOriginal,originalBytes,verifiedSha256:hash,
    createdAt:data.createdAt||'',originHint:data.originHint||''
   }
  };
 }
 root.NexusBackupVerifier=Object.freeze({verify});
})(globalThis);
