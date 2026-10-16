/* NEXUS-X recovery incident audit. Read-only, no external services or data copies. */
(function(root){
 'use strict';
 const classifyList=raw=>{
  if(raw===null)return {state:'absent',count:0};
  try{
   const rows=JSON.parse(raw);
   if(!Array.isArray(rows))return {state:'invalid',count:null};
   return {state:'valid',count:rows.length};
  }catch{return {state:'invalid',count:null};}
 };
 const expectedCount=n=>Number.isSafeInteger(n)&&n>=0&&n<=100000?n:null;
 const numberOrNull=n=>Number.isSafeInteger(n)&&n>=0?n:null;
 function assess({journalRaw,inventoryRaw,calendarRaw,favoritesRaw,documents}={}){
  const store={
   inventory:classifyList(inventoryRaw??null),
   calendar:classifyList(calendarRaw??null),
   favorites:classifyList(favoritesRaw??null)
  };
  const docs=documents&&documents.error
   ?{state:'unavailable',count:null,originals:null,originalBytes:null}
   :documents&&numberOrNull(documents.count)!==null&&
    numberOrNull(documents.originals)!==null&&
    numberOrNull(documents.originalBytes)!==null&&
    documents.originals<=documents.count
    ?{state:'available',count:documents.count,originals:documents.originals,
      originalBytes:documents.originalBytes}
    :{state:'unavailable',count:null,originals:null,originalBytes:null};
  let journalState=journalRaw===null||journalRaw===undefined?'absent':'invalid',raw;
  if(journalState!=='absent'){
   try{
    const parsed=JSON.parse(journalRaw);
    if(parsed&&parsed.schemaVersion===1&&parsed.phase==='restore-in-progress'&&
       expectedCount(parsed.records)!==null&&expectedCount(parsed.documents)!==null){
      journalState='interrupted';
      raw=parsed;
    }
   }catch{}
  }
  const expected=journalState==='interrupted'
   ?{records:raw.records,documents:raw.documents}:null;
  const inventoryMatches=expected!==null&&store.inventory.state==='valid'&&
   store.inventory.count===expected.records;
  const documentsMatch=expected!==null&&docs.state==='available'&&
   docs.count===expected.documents;
  // Counts can match with corrupt or missing records. Never advertise self-repair.
  const findings=[
   ...(journalState==='interrupted'?['Se encontró una restauración sin finalizar.']:
     journalState==='invalid'?['Existe una marca de recuperación dañada o no compatible.']:
      ['No hay una marca de restauración interrumpida.']),
   ...(store.inventory.state==='invalid'?['Inventario JSON inválido.']:[]),
   ...(store.calendar.state==='invalid'?['Calendario JSON inválido.']:[]),
   ...(store.favorites.state==='invalid'?['Favoritos JSON inválidos.']:[]),
   ...(docs.state==='unavailable'?['No se pudo comprobar el recuento de documentos.']:[])
  ];
  if(expected!==null){
   findings.push(inventoryMatches&&documentsMatch
    ?'Las cantidades coinciden, pero la integridad y finalización NO pueden certificarse solo con recuentos.'
    :'Las cantidades no coinciden o no pudieron verificarse: pueden existir datos parciales.');
  }
  return {
   format:'nexus-x-restore-incident-audit',schemaVersion:1,
   status:journalState==='absent'?'no-interruption-marker':'manual-review-required',
   journalState,
   declared:expected,
   observed:{...store,documents:docs},
   comparisons:{inventoryCountMatches:inventoryMatches,documentCountMatches:documentsMatch},
   manifestSha256:journalState==='interrupted'&&/^[a-f0-9]{64}$/.test(raw.manifestSha256||'')
    ?raw.manifestSha256:null,
   findings,
   recommendation:'Conservá el ZIP original y el almacenamiento local. No borres datos ni la marca; solicitá revisión técnica antes de reintentar.'
  };
 }
 root.NexusRecoveryAudit=Object.freeze({assess});
})(globalThis);
