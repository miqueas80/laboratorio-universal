/* NEXUS-X educational workspace archive: explicit, offline, conflict-preserving. */
(function(root){
 'use strict';
 const MAX_ZIP=128*1024*1024,MAX_RAW=170*1024*1024,MAX_MANIFEST=3*1024*1024,MAX_DOCS=200,MAX_FILE=16*1024*1024;
 const ID=/^NEXUS-X-\d{4}$/;
 const DOC=/\.(pdf|docx|xlsx|xls)$/i;
 const SPACE=/^ws-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
 function assert(condition,message){if(!condition)throw Error(message);}
 function workspaceIdValid(id){return id==='personal'||SPACE.test(String(id||''));}
 function validInventory(items){
  assert(Array.isArray(items)&&items.length<=20000,'Cantidad de registros inválida.');
  const seen=new Set();
  for(const r of items){
   assert(r&&typeof r==='object'&&!Array.isArray(r),'Registro de inventario inválido.');
   assert(ID.test(String(r.id||''))&&String(r.name||'').trim(),'Código o nombre de inventario inválido.');
   assert(!seen.has(r.id),'IDs de inventario duplicados.');seen.add(r.id);
  }
 }
 function validCalendar(items){
  assert(Array.isArray(items)&&items.length<=10000,'Calendario inválido.');
  for(const e of items)assert(e&&/^\d{4}-\d{2}-\d{2}$/.test(String(e.date||''))&&typeof e.text==='string'&&e.text.trim(),'Evento inválido.');
 }
 function safeDocumentName(name){
  const text=String(name||'').trim();
  assert(text.length>0&&text.length<=240&&!/[\/\\\u0000-\u001f\u007f]/.test(text)&&DOC.test(text),'Nombre o tipo de documento no admitido.');
  return text;
 }
 function validSnapshot(manifest){
  assert(manifest?.schema===1,'Versión de respaldo no compatible.');
  assert(workspaceIdValid(manifest?.workspace?.id),'ID de institución inválido.');
  assert(String(manifest.workspace.name||'').length<=100,'Nombre institucional inválido.');
  validInventory(manifest.inventory);
  validCalendar(manifest.calendar);
  assert(Array.isArray(manifest.documents)&&manifest.documents.length<=MAX_DOCS,'Cantidad documental inválida.');
  for(const [i,d] of manifest.documents.entries()){
   assert(d?.path==='files/'+String(i).padStart(4,'0')+String(d.name).toLowerCase().match(/\.(pdf|docx|xlsx|xls)$/)?.[0],
    'Estructura documental inválida.');
   safeDocumentName(d.name);
   assert(Number.isSafeInteger(d.size)&&d.size>0&&d.size<=MAX_FILE,'Tamaño documental inválido.');
  }
  return manifest;
 }
 function mergeInventory(current,incoming){
  validInventory(current);validInventory(incoming);
  const map=new Map(current.map(r=>[r.id,r])),merged=[...current],conflicts=[];
  let added=0,unchanged=0;
  for(const item of incoming){
   const prior=map.get(item.id);
   if(!prior){merged.push(item);map.set(item.id,item);added++;}
   else if(JSON.stringify(prior)===JSON.stringify(item))unchanged++;
   else conflicts.push(item.id);
  }
  return {records:merged,added,unchanged,conflicts};
 }
 function mergeCalendar(current,incoming){
  validCalendar(current);validCalendar(incoming);
  const keys=new Set(current.map(x=>x.date+'\u0000'+x.text));
  const merged=[...current];let added=0;
  for(const e of incoming){const key=e.date+'\u0000'+e.text;if(!keys.has(key)){merged.push(e);keys.add(key);added++;}}
  return {events:merged,added};
 }
 async function createArchive({workspace,inventory,calendar,documents,Zip}){
  assert(Zip&&typeof Zip==='function','Motor ZIP no disponible.');
  assert(workspaceIdValid(workspace?.id),'Espacio de trabajo inválido.');
  validInventory(inventory);validCalendar(calendar);
  assert(Array.isArray(documents),'Índice de documentos inválido.');
  const zip=new Zip(),docs=[],limit=Math.min(documents.length,MAX_DOCS);
  let raw=0,skipped=0;
  for(let i=0;i<documents.length;i++){
   const doc=documents[i],blob=doc?.blob;
   if(i>=MAX_DOCS||!blob||!blob.size||blob.size>MAX_FILE){skipped++;continue;}
   let name;try{name=safeDocumentName(doc.name)}catch{skipped++;continue;}
   raw+=blob.size;
   assert(raw<=MAX_RAW,'La selección documental supera 170 MB. Exportá menos archivos.');
   const ext=name.toLowerCase().match(/\.(pdf|docx|xlsx|xls)$/)[0];
   const path='files/'+String(docs.length).padStart(4,'0')+ext;
   zip.file(path,blob);docs.push({path,name,size:blob.size});
  }
  const manifest={schema:1,workspace:{id:workspace.id,name:String(workspace.name||'Escuela').slice(0,100)},generatedAt:new Date().toISOString(),inventory,calendar,documents:docs};
  validSnapshot(manifest);
  const data=JSON.stringify(manifest);
  assert(new Blob([data]).size<=MAX_MANIFEST,'Metadatos del respaldo demasiado grandes.');
  zip.file('nexus-workspace.json',data);
  const file=await zip.generateAsync({type:'blob',compression:'STORE',streamFiles:true});
  assert(file.size<=MAX_ZIP,'El respaldo supera 128 MB. Seleccioná menos documentos.');
  return {file,files:docs.length,skipped};
 }
 async function openArchive(file,Zip){
  assert(file&&file.size>0&&file.size<=MAX_ZIP,'El archivo ZIP está vacío o supera 128 MB.');
  assert(Zip&&typeof Zip.loadAsync==='function','Motor ZIP no disponible.');
  const zip=await Zip.loadAsync(file,{checkCRC32:false});
  const manifestEntry=zip.file('nexus-workspace.json');
  assert(manifestEntry&&!manifestEntry.dir,'No es un respaldo institucional de NEXUS-X.');
  assert(Number(manifestEntry._data?.uncompressedSize||0)<=MAX_MANIFEST,'Manifiesto demasiado grande.');
  const str=await manifestEntry.async('string');
  assert(str.length<=MAX_MANIFEST,'Manifiesto demasiado grande.');
  const manifest=validSnapshot(JSON.parse(str));
  let raw=0;
  for(const doc of manifest.documents){
   const entry=zip.file(doc.path);
   assert(entry&&!entry.dir,'Falta un documento declarado en el respaldo.');
   const size=Number(entry._data?.uncompressedSize||0);
   assert(size===doc.size,'El tamaño declarado de un documento no coincide.');
   raw+=size;assert(raw<=MAX_RAW,'Respaldo expandido demasiado grande.');
  }
  return {manifest,zip};
 }
 async function documentFile(archive,descriptor){
  const entry=archive.zip.file(descriptor.path);
  assert(entry,'No se encontró el archivo.');
  const blob=await entry.async('blob');
  assert(blob.size===descriptor.size&&blob.size<=MAX_FILE,'Documento dañado o tamaño inválido.');
  return new File([blob],descriptor.name,{type:blob.type||'application/octet-stream'});
 }
 root.NexusWorkspaceArchive=Object.freeze({createArchive,openArchive,documentFile,mergeInventory,mergeCalendar,validSnapshot,workspaceIdValid,limits:{MAX_ZIP,MAX_DOCS,MAX_FILE}});
})(globalThis);
