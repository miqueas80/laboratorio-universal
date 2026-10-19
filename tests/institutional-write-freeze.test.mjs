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
const guard=between('function assertInstitutionalWritable(){','const state=');
const marker='nexus_x_institutional_restore_journal_v1';
function harness(extra={}){
 const calls={write:0,open:0,toast:[]};
 const context={
  Error,JSON,Set,Array,Promise,
  INSTITUTIONAL_RESTORE_JOURNAL_KEY:marker,
  readStorage:key=>key===marker?'{"phase":"restore-in-progress"}':null,
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
 const code=between('function saveCalendarEvents(events,expectedRaw){','function pad2(n)');
 vm.runInContext(code,h.context,{filename:'app-calendar.js'});
 assert.throws(()=>h.context.saveCalendarEvents([]),/Restauración institucional pendiente/);
 assert.equal(h.calls.write,0);
});


test('Calendar: stale snapshot is rejected without overwriting another tab',()=>{
 const writes=[];
 const h=harness({
  CAL_KEY:'calendar',
  readStorage:key=>key===marker?null:key==='calendar'?'[{"date":"2026-10-19","text":"Nuevo evento"}]':null,
  writeStorage:(key,value)=>writes.push({key,value}),
  isValidCalendarDate:()=>true,
  renderMiniCalendar:()=>{}
 });
 const code=between('function saveCalendarEvents(events,expectedRaw){','function pad2(n)');
 vm.runInContext(code,h.context,{filename:'calendar-concurrency.js'});
 assert.throws(()=>h.context.saveCalendarEvents([], '[]'),/calendario cambió/);
 assert.deepEqual(writes,[]);
});
test('Calendar: matching snapshot commits, missing snapshot fails safely',()=>{
 const writes=[];
 const h=harness({
  CAL_KEY:'calendar',
  readStorage:key=>key===marker?null:key==='calendar'?'[]':null,
  writeStorage:(key,value)=>writes.push([key,value]),
  isValidCalendarDate:()=>true,
  renderMiniCalendar:()=>{}
 });
 const code=between('function saveCalendarEvents(events,expectedRaw){','function pad2(n)');
 vm.runInContext(code,h.context,{filename:'calendar-concurrency.js'});
 assert.throws(()=>h.context.saveCalendarEvents([]),/Falta la versión/);
 assert.equal(writes.length,0);
 h.context.saveCalendarEvents([{date:'2026-10-19',text:'Práctica'}],'[]');
 assert.equal(writes.length,1);
 assert.deepEqual(JSON.parse(writes[0][1]),[{date:'2026-10-19',text:'Práctica'}]);
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
