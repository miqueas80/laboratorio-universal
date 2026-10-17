import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
function between(start,end){
 const i=source.indexOf(start),j=source.indexOf(end,i+start.length);
 assert.ok(i>=0&&j>i,'Missing expected institutional write boundary: '+start);
 return source.slice(i,j);
}
const guard=between('function readStorageStrict(key){','const state=');
const marker='nexus_x_institutional_restore_journal_v1';
function harness(extra={}){
 const calls={write:0,open:0,storageErrors:0,toast:[]};
 const context={
  Error,JSON,Set,Array,Promise,
  INSTITUTIONAL_RESTORE_JOURNAL_KEY:marker,
  readStorage:key=>key===marker?'{"phase":"restore-in-progress"}':null,
  // The write barrier must inspect actual storage, not the error-tolerant reader.
  installationStore:{getItem:key=>key===marker?'{"phase":"restore-in-progress"}':null},
  storageFailure:()=>{calls.storageErrors++;},
  writeStorage:()=>{calls.write++;},
  openDocDB:async()=>{calls.open++;throw new Error('Document DB should not open');},
  state:{favorites:new Set(['NEXUS-X-0001']),inventoryReadOnly:true,inventoryError:''},
  toast:message=>calls.toast.push(message),
  ...extra
 };
 vm.createContext(context);
 vm.runInContext(guard,context,{filename:'app-guard.js'});
 return {context,calls};
}

test('Fail-closed: document insertion cannot even open IndexedDB with an interrupted journal',async()=>{
 const h=harness();
 const code=between('async function putDoc(doc,{createOnly=false}={}){','async function getCachedDocs()');
 vm.runInContext(code,h.context,{filename:'app-put-doc.js'});
 await assert.rejects(h.context.putDoc({path:'local:private.pdf'}),/Restauración institucional pendiente/);
 assert.equal(h.calls.open,0);
});

test('Fail-closed: calendar events cannot be saved while recovery is unresolved',()=>{
 const h=harness();
 const code=between('function saveCalendarEvents(events){','function pad2(n)');
 vm.runInContext(code,h.context,{filename:'app-calendar.js'});
 assert.throws(()=>h.context.saveCalendarEvents([]),/Restauración institucional pendiente/);
 assert.equal(h.calls.write,0);
});

test('Fail-closed: favorites cannot be changed while recovery is unresolved',()=>{
 const h=harness();
 const code=between('function toggleFavorite(id){','function saveQueryHistory(q)');
 vm.runInContext(code,h.context,{filename:'app-favorites.js'});
 assert.equal(h.context.toggleFavorite('NEXUS-X-0001'),false);
 assert.equal(h.calls.write,0);
 assert.equal(h.context.state.favorites.has('NEXUS-X-0001'),true);
 assert.match(h.calls.toast.join(' '),/Restauración institucional pendiente/);
});

test('Fail-closed: storage event from another tab locks institution immediately',()=>{
 const h=harness({
  STORE_PREFIX:'scope:',DB_KEY:'inventory',CAL_KEY:'calendar',
  renderDashboard:()=>{},renderAll:()=>{},renderMiniCalendar:()=>{},
  renderCalendar:()=>{},renderInventory:()=>{},
  $:()=>({classList:{contains:()=>false}}),
  readJsonStorage:()=>[]
 });
 const code=between('function handleStorageChange(event){','let bound=false;');
 vm.runInContext(code,h.context,{filename:'app-storage-events.js'});
 h.context.handleStorageChange({
  key:'scope:'+marker,newValue:'{"phase":"restore-in-progress"}'
 });
 assert.equal(h.context.state.inventoryReadOnly,true);
 assert.match(h.context.state.inventoryError,/Restauración institucional/);
 assert.ok(h.calls.toast.length>0);
});

test('Fail-closed: unreadable localStorage rejects every institutional write before touching documents',async()=>{
 const h=harness({installationStore:{getItem(){throw new Error('localStorage read denied')}}});
 const doc=between('async function putDoc(doc,{createOnly=false}={}){','async function getCachedDocs()');
 const cal=between('function saveCalendarEvents(events){','function pad2(n)');
 const fav=between('function toggleFavorite(id){','function saveQueryHistory(q)');
 const inv=between('function saveInventory(records=state.inventory,{backup=false}={}){','async function restoreMaster()');
 const recovery=between('function restoreInventoryBackup(){','function saveActivity(text)');
 for(const [filename,code] of [['doc',doc],['cal',cal],['fav',fav],['inventory',inv],['recovery',recovery]])
  vm.runInContext(code,h.context,{filename:'app-'+filename+'-storage-denial.js'});
 await assert.rejects(h.context.putDoc({path:'local:private.pdf'}),/edición bloqueada/);
 assert.throws(()=>h.context.saveCalendarEvents([]),/edición bloqueada/);
 assert.equal(h.context.toggleFavorite('NEXUS-X-0001'),false);
 assert.equal(h.context.saveInventory([]),false);
 assert.equal(h.context.restoreInventoryBackup(),false);
 assert.equal(h.calls.open,0,'No IndexedDB transaction can begin');
 assert.equal(h.calls.write,0,'No stored records can be overwritten');
 assert.equal(h.context.state.favorites.has('NEXUS-X-0001'),true);
 assert.match(h.calls.toast.join(' '),/edición bloqueada/);
 assert.equal(h.calls.storageErrors,5,'Every attempted mutation logs storage failure');
});

test('Restore preflight: verified ZIP remains inspectable but cannot restore when storage reads fail',async()=>{
 const elements={
  '#backupInspection':{textContent:''},
  '#inspectBackupBtn':{disabled:false},
  '#restoreEmptyBackupBtn':{disabled:true},
  '#backupZipInput':{value:'selected'}
 };
 const make=installationStore=>harness({
  installationStore,
  CAL_KEY:'calendar',INVENTORY_RECOVERY_KEY:'recovery',
  state:{inventory:[],docs:[],inventoryReadOnly:false},
  $:selector=>elements[selector]||null,
  loadScript:async()=>{},
  NexusBackupVerifier:{verify:async()=>({
   valid:true,summary:{records:1,documents:1,originals:1,
    originalsUnavailable:0,verifiedSha256:'a'.repeat(64)}})},
  JSZip:{}
 });
 const region=between('let verifiedInstitutionalBackup=null;','async function exportInstitutionalBackup(){');
 const blocked=make({getItem(){throw new Error('Storage denied')}});
 vm.runInContext(region,blocked.context,{filename:'app-backup-inspection-denied.js'});
 await blocked.context.inspectInstitutionalBackup({name:'verified-test.zip'});
 assert.match(elements['#backupInspection'].textContent,/Respaldo válido/);
 assert.match(elements['#backupInspection'].textContent,/SOLO LECTURA/);
 assert.equal(elements['#restoreEmptyBackupBtn'].disabled,true);
 const allowed=make({getItem:()=>null});
 vm.runInContext(region,allowed.context,{filename:'app-backup-inspection-enabled.js'});
 await allowed.context.inspectInstitutionalBackup({name:'verified-test.zip'});
 assert.equal(elements['#restoreEmptyBackupBtn'].disabled,false);
 assert.match(elements['#backupInspection'].textContent,/podés iniciar una restauración/);
});

test('Multitab: a valid external inventory event cannot unlock UI if journal reads fail',()=>{
 const h=harness({
  installationStore:{getItem(){throw new Error('storage denied')}},
  STORE_PREFIX:'scope:',DB_KEY:'inventory',CAL_KEY:'calendar',
  state:{inventory:[],inventoryRaw:'[]',favorites:new Set(),inventoryReadOnly:false,inventoryError:''},
  $:()=>({classList:{contains:()=>false}}),
  validateInventory:()=>true,renderAll:()=>{},renderDashboard:()=>{},renderInventory:()=>{},
  renderCalendar:()=>{},renderMiniCalendar:()=>{},
  readJsonStorage:()=>[]
 });
 vm.runInContext(between('function handleStorageChange(event){','let bound=false;'),
  h.context,{filename:'app-storage-change-denial.js'});
 h.context.handleStorageChange({key:'scope:inventory',newValue:'[{"id":"NEXUS-X-0001"}]'});
 assert.equal(h.context.state.inventoryReadOnly,true);
 assert.match(h.context.state.inventoryError,/edición bloqueada/);
 assert.equal(h.calls.storageErrors,1);
});

test('Manual recovery: second tab creates a journal during confirmation, no institutional writes occur',()=>{
 let journal=null;
 const writes=[];
 const h=harness({
  installationStore:{getItem:key=>key===marker?journal:key==='recovery'||key==='inventory'?'[]':null},
  INVENTORY_RECOVERY_KEY:'recovery',DB_KEY:'inventory',
  readStorage:key=>key==='recovery'?'[]':key==='inventory'?'[]':null,
  state:{inventoryRaw:'[]',inventory:[],inventoryReadOnly:false,favorites:new Set()},
  confirm:()=>{journal='{"phase":"restore-in-progress"}';return true;},
  validateInventory:()=>true,
  writeStorage:(key,value)=>writes.push(key)
 });
 vm.runInContext(between('function restoreInventoryBackup(){','function saveActivity(text)'),
  h.context,{filename:'app-restore-race-regression.js'});
 assert.equal(h.context.restoreInventoryBackup(),false);
 assert.deepEqual(writes,[]);
 assert.match(h.calls.toast.join(' '),/Restauración institucional pendiente/);
});

test('Fail-closed: selective inventory read failure cannot appear as an empty inventory',()=>{
 const h=harness({
  installationStore:{getItem:key=>{
   if(key===marker)return null;
   if(key==='inventory')throw new Error('Denied inventory read');
   return null;
  }},
  DB_KEY:'inventory',INVENTORY_RECOVERY_KEY:'recovery',
  state:{inventory:[],inventoryRaw:null,inventoryReadOnly:false,inventoryError:''},
  validateInventory:()=>true
 });
 vm.runInContext(between('function saveInventory(records=state.inventory,{backup=false}={}){','async function restoreMaster()'),
  h.context,{filename:'app-inventory-strict-read.js'});
 assert.equal(h.context.saveInventory([]),false);
 assert.equal(h.calls.write,0);
 assert.match(h.context.state.inventoryError,/operación bloqueada/);
 assert.equal(h.calls.storageErrors,1);
});
test('Fail-closed: a selective backup read denial prevents manual recovery',()=>{
 const h=harness({
  installationStore:{getItem:key=>{
   if(key===marker)return null;
   if(key==='recovery')throw new Error('Denied backup read');
   return '[]';
  }},
  DB_KEY:'inventory',INVENTORY_RECOVERY_KEY:'recovery',
  state:{inventory:[],inventoryRaw:'[]',inventoryReadOnly:false}
 });
 vm.runInContext(between('function restoreInventoryBackup(){','function saveActivity(text)'),
  h.context,{filename:'app-manual-restore-strict-read.js'});
 assert.equal(h.context.restoreInventoryBackup(),false);
 assert.equal(h.calls.write,0);
 assert.match(h.calls.toast.join(' '),/operación bloqueada/);
});
