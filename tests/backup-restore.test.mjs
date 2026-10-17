import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../backup-restore.js',import.meta.url),'utf8');
const context=vm.createContext({Blob,Promise,Array,Map,Set,JSON,Error});
vm.runInContext(source,context,{filename:'backup-restore.js'});
const restore=context.NexusBackupRestore.restoreEmpty;
const inv=[{id:'NEXUS-X-0001',name:'Material restaurado'}];
const pdf=new TextEncoder().encode('%PDF-1.4 synthetic test');

function scenario({data={},initial={},storedDocs=[],failWrite='',failDocuments=false,
 afterStage=null,failRollback=false,afterDocumentsCommitted=null,failPostCommitCount=false}={}){
 const sourceData={schemaVersion:1,inventory:inv,calendar:[{title:'Clase'}],
  favorites:['NEXUS-X-0001'],
  documents:[{path:'local:fixture.pdf',name:'fixture.pdf',type:'PDF',text:'NEXUS',
   original:{archivePath:'originales/00001.bin',mime:'application/pdf'}}],...data};
 const archive={valid:true,data:sourceData,summary:{originals:1},zip:{
  file:path=>path==='originales/00001.bin'?{async:async()=>{await afterStage?.();return pdf;}}:null
 }};
 const keys=new Map(Object.entries({'inventory':'[]',...initial}));
 const docs=new Map(storedDocs.map(d=>[d.path,d]));
 const writes=[],deletes=[];
 const io={
  inventoryKey:'inventory',calendarKey:'calendar',favoritesKey:'favorites',
  recoveryKey:'recovery',beforeRestoreKey:'beforeRestore',journalKey:'restoreJournal',
  expectedInventoryRaw:'[]',
  read:k=>keys.has(k)?keys.get(k):null,
  write:(k,value)=>{
   if(failWrite===k)throw Error('Quota exceeded: '+k);
   writes.push(k);keys.set(k,value);
  },
  remove:k=>{deletes.push(k);keys.delete(k)},
  countDocuments:async()=>{
   if(failPostCommitCount&&docs.size>0)throw Error('IndexedDB count unavailable');
   return docs.size;
  },
  addDocumentsAtomic:async rows=>{
   if(failDocuments)throw Error('IndexedDB failure');
   const paths=rows.map(r=>r.path);
   if(paths.some(p=>docs.has(p)))throw Error('Duplicate original document');
   for(const row of rows)docs.set(row.path,row);
   await afterDocumentsCommitted?.();
  },
  removeDocumentsAtomic:async paths=>{
   if(failRollback)throw Error('Simulated rollback failure');
   for(const path of paths)docs.delete(path);
  }
 };
 return {archive,keys,docs,io,writes,deletes,call:()=>restore(archive,io)};
}

test('Restore: clean installation receives inventory, calendar, favorites and original binary',async()=>{
 const s=scenario();
 const result=await s.call();
 assert.equal(result.inventory[0].id,'NEXUS-X-0001');
 assert.equal(JSON.parse(s.keys.get('inventory')).length,1);
 assert.equal(JSON.parse(s.keys.get('calendar'))[0].title,'Clase');
 assert.equal(JSON.parse(s.keys.get('favorites'))[0],'NEXUS-X-0001');
 assert.equal(await s.docs.get('local:fixture.pdf').blob.text(),'%PDF-1.4 synthetic test');
 assert.deepEqual(s.writes,['restoreJournal','calendar','favorites','inventory'],'journal must commit first; inventory last');
 assert.equal(s.keys.has('restoreJournal'),false,'successful recovery must clear journal');
});
test('Restore: refuses an institution with existing inventory without writing anything',async()=>{
 const s=scenario({initial:{inventory:JSON.stringify(inv)}});
 await assert.rejects(s.call(),/cambió|existe inventario/);
 assert.equal(s.docs.size,0);assert.deepEqual(s.writes,[]);
});
test('Restore: refuses an institution with existing calendar or favorites',async()=>{
 for(const key of ['calendar','favorites']){
  const s=scenario({initial:{[key]:'[{"title":"Existing"}]'}});
  await assert.rejects(s.call(),new RegExp(key==='calendar'?'calendario':'favoritos'));
  assert.deepEqual(s.writes,[]);
 }
});
test('Restore: refuses any existing stored document, including hidden historical documents',async()=>{
 const s=scenario({storedDocs:[{path:'history:hidden'}]});
 await assert.rejects(s.call(),/existen documentos/);
 assert.deepEqual(s.writes,[]);
});
test('Restore: refuses installations holding recovery data',async()=>{
 for(const key of ['recovery','beforeRestore']){
  const s=scenario({initial:{[key]:'old history'}});
  await assert.rejects(s.call(),/copias de recuperación/);
  assert.equal(s.docs.size,0);
 }
});
test('Restore: blocks concurrent inventory mutation during binary staging',async()=>{
 const s=scenario({afterStage:()=>s.keys.set('inventory','[{"id":"OTHER"}]')});
 await assert.rejects(s.call(),/otro proceso cambió/);
 assert.equal(s.docs.size,0);assert.deepEqual(s.writes,[]);
});
test('Restore: document transaction failure leaves empty institutional storage untouched',async()=>{
 const s=scenario({failDocuments:true});
 await assert.rejects(s.call(),/IndexedDB failure/);
 assert.equal(s.keys.get('inventory'),'[]');
 assert.equal(s.docs.size,0);
 assert.deepEqual(s.writes,['restoreJournal']);
 assert.equal(s.keys.has('restoreJournal'),false,'failed transaction must remove the marker');
});
test('Restore: a localStorage failure rolls back atomic document insertion and calendar edits',async()=>{
 const s=scenario({failWrite:'inventory'});
 await assert.rejects(s.call(),/Quota exceeded/);
 assert.equal(s.docs.size,0);
 assert.equal(s.keys.get('inventory'),'[]');
 assert.equal(s.keys.has('calendar'),false);
 assert.equal(s.keys.has('favorites'),false);
 assert.deepEqual(s.deletes,['favorites','calendar','restoreJournal']);
});
test('Restore: failed rollback explicitly reports dangerous partial state',async()=>{
 const s=scenario({failWrite:'inventory',failRollback:true});
 await assert.rejects(s.call(),/no se pudo revertir completamente/);
 assert.equal(s.docs.size,1);
});
test('Restore: refuses to overwrite an interrupted import marker even with no inventory',async()=>{
 const s=scenario({initial:{restoreJournal:JSON.stringify({phase:'restore-in-progress'})}});
 await assert.rejects(s.call(),/restauración anterior sin cerrar/);
 assert.equal(s.keys.has('restoreJournal'),true);
 assert.equal(s.docs.size,0);
 assert.deepEqual(s.writes,[]);
});

test('Restore: interrupted rollback keeps the journal for manual recovery',async()=>{
 const s=scenario({failWrite:'inventory',failRollback:true});
 await assert.rejects(s.call(),/no se pudo revertir completamente/);
 const marker=JSON.parse(s.keys.get('restoreJournal'));
 assert.equal(marker.phase,'restore-in-progress');
 assert.equal(marker.records,1);
 assert.equal(marker.documents,1);
});

test('Restore: a simulated browser kill during document commit leaves a durable warning marker',async()=>{
 let releaseCommit;
 const blocked=new Promise(resolve=>{releaseCommit=resolve});
 let signalDocumentCommitted;
 const committed=new Promise(resolve=>{signalDocumentCommitted=resolve});
 const s=scenario({afterDocumentsCommitted:async()=>{signalDocumentCommitted();await blocked;}});
 const interrupted=s.call();
 await committed;
 assert.equal(s.docs.size,1);
 assert.equal(JSON.parse(s.keys.get('restoreJournal')).phase,'restore-in-progress');
 await assert.rejects(s.call(),/restauración anterior sin cerrar/);
 releaseCommit();
 await interrupted;
 assert.equal(s.keys.has('restoreJournal'),false);
});

test('Restore: refuses archives that have not passed SHA-256 verification',async()=>{
 const s=scenario();s.archive.valid=false;
 await assert.rejects(s.call(),/ZIP no fue verificado/);
 assert.equal(s.docs.size,0);
});

test('Restore: document adapter rejects AFTER committing, durable journal remains for manual review',async()=>{
 const s=scenario({afterDocumentsCommitted:()=>{throw Error('Adapter error after IndexedDB commit')}});
 await assert.rejects(s.call(),/no se pudo revertir completamente.*IndexedDB/);
 assert.equal(s.docs.size,1,'A potentially committed original must not be erased automatically');
 assert.equal(s.keys.has('restoreJournal'),true,'Never clear the incident marker on ambiguous commit');
 assert.equal(JSON.parse(s.keys.get('restoreJournal')).phase,'restore-in-progress');
 assert.equal(s.keys.get('inventory'),'[]');
 assert.deepEqual(s.writes,['restoreJournal'],'No institution metadata was published');
 await assert.rejects(s.call(),/restauración anterior sin cerrar/);
});
test('Restore: unverifiable document store after adapter error keeps the recovery journal',async()=>{
 const s=scenario({
  failPostCommitCount:true,
  afterDocumentsCommitted:()=>{throw Error('Response lost after commit')}
 });
 await assert.rejects(s.call(),/no se pudo revertir completamente.*IndexedDB/);
 assert.equal(s.keys.has('restoreJournal'),true);
 assert.equal(s.keys.get('inventory'),'[]');
 assert.equal(s.docs.size,1);
});
test('Restore: adapter success with incomplete document set rolls back before inventory publication',async()=>{
 const s=scenario({afterDocumentsCommitted:()=>{s.docs.clear()}});
 await assert.rejects(s.call(),/documentos importados no coinciden/);
 assert.equal(s.docs.size,0);
 assert.equal(s.keys.has('restoreJournal'),false,'Verified empty rollback may remove the journal');
 assert.equal(s.keys.get('inventory'),'[]');
 assert.deepEqual(s.writes,['restoreJournal']);
});
