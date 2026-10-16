/* Non-destructive institutional restore for a FRESH, EMPTY installation only.
 * Restore never overwrites existing inventory, calendar, favorites, backups or documents.
 * Archive must first pass NexusBackupVerifier.verify(), including all SHA256 checks.
 */
(function(root){
 'use strict';
 const assert=(condition,message)=>{if(!condition)throw new Error('Restauración bloqueada: '+message)};
 const EMPTY=x=>{
  if(x===null)return true;
  try{return Array.isArray(JSON.parse(x))&&JSON.parse(x).length===0}catch{return false}
 };
 async function restoreEmpty(verified,io){
  assert(verified?.valid===true&&verified?.zip&&verified?.data?.schemaVersion===1,
   'el ZIP no fue verificado.');
  const data=verified.data;
  const keys=[io.inventoryKey,io.calendarKey,io.favoritesKey],before=new Map();
  for(const key of keys)before.set(key,io.read(key));
  assert(before.get(io.inventoryKey)===io.expectedInventoryRaw,
   'el inventario cambió desde la última comprobación.');
  assert(EMPTY(before.get(io.inventoryKey)),'ya existe inventario.');
  assert(EMPTY(before.get(io.calendarKey)),'ya existen eventos de calendario.');
  assert(EMPTY(before.get(io.favoritesKey)),'ya existen favoritos.');
  assert(typeof io.journalKey==='string'&&io.journalKey.length>0,
   'falta el registro de recuperación persistente.');
  assert(io.read(io.journalKey)===null,
   'hay una restauración anterior sin cerrar. Conservá los datos y el ZIP.');
  assert(io.read(io.recoveryKey)===null&&io.read(io.beforeRestoreKey)===null,
   'hay copias de recuperación que deben preservarse.');
  assert((await io.countDocuments())===0,'ya existen documentos locales.');
  const restoredDocs=[];
  for(const item of data.documents){
   const {original,...meta}=item;
   let blob=null;
   if(original){
    const entry=verified.zip.file(original.archivePath);
    assert(entry,'faltó un original verificado.');
    const bytes=await entry.async('uint8array');
    blob=new Blob([bytes],{type:original.mime||meta.mime||'application/octet-stream'});
   }
   restoredDocs.push({...meta,blob});
  }
  // Repeat all preconditions after asynchronous staging, before any writes.
  for(const [key,value] of before)assert(io.read(key)===value,
   'otro proceso cambió los datos mientras se preparaba la restauración.');
  assert((await io.countDocuments())===0,'otro proceso agregó documentos.');
  // Write-ahead marker survives a browser kill or power loss during IndexedDB writes.
  // Metadata only: never copies private document contents into localStorage.
  const marker=JSON.stringify({schemaVersion:1,phase:'restore-in-progress',
   createdAt:new Date().toISOString(),records:data.inventory.length,
   documents:data.documents.length,manifestSha256:verified.summary.verifiedSha256||null});
  const written=new Map();
  let documentsCommitted=false,journalWritten=false;
  try{
   assert(io.read(io.journalKey)===null,'otra restauración ya está en curso.');
   io.write(io.journalKey,marker);
   journalWritten=true;
   if(restoredDocs.length){
    await io.addDocumentsAtomic(restoredDocs);
    documentsCommitted=true;
   }
   // Browser localStorage offers no transaction or CAS; check again.
   for(const [key,value] of before)assert(io.read(key)===value,
    'otro proceso cambió información durante el guardado de documentos.');
   const values=new Map([
    [io.calendarKey,JSON.stringify(data.calendar)],
    [io.favoritesKey,JSON.stringify(data.favorites)],
    [io.inventoryKey,JSON.stringify(data.inventory)]
   ]);
   // Inventory is published LAST, only after all document originals are committed.
   for(const [key,value] of values){
    assert(io.read(key)===before.get(key),'un dato cambió antes del guardado.');
    assert(io.read(io.journalKey)===marker,'registro de restauración cambiado.');
    io.write(key,value);written.set(key,value);
   }
   assert(io.read(io.journalKey)===marker,'registro de restauración cambiado.');
   io.remove(io.journalKey);journalWritten=false;
   return {inventory:data.inventory,calendar:data.calendar,favorites:data.favorites,
    documents:restoredDocs,originals:verified.summary.originals};
  }catch(error){
   const problems=[];
   for(const [key,value] of [...written].reverse()){
    try{
     // Never roll back a value another tab has since changed.
     if(io.read(key)!==value)throw new Error('modificado por otra pestaña');
     value===undefined?io.remove(key):before.get(key)===null?io.remove(key):io.write(key,before.get(key));
    }catch(e){problems.push(key+': '+e.message);}
   }
   if(documentsCommitted)try{await io.removeDocumentsAtomic(restoredDocs.map(x=>x.path));}
    catch(e){problems.push('documentos: '+e.message);}
   if(journalWritten&&!problems.length)try{
    // Never erase another process's marker.
    if(io.read(io.journalKey)!==marker)throw new Error('registro modificado por otra pestaña');
    io.remove(io.journalKey);journalWritten=false;
   }catch(e){problems.push('registro de recuperación: '+e.message);}
   if(problems.length)throw new Error(
    'Restauración interrumpida; no se pudo revertir completamente. No sigas editando datos. '+
     problems.join('; '),{cause:error});
   throw error;
  }
 }
 root.NexusBackupRestore=Object.freeze({restoreEmpty});
})(globalThis);
