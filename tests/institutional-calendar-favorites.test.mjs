import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
function between(start,end){
 const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,'Missing calendar/favorites protection: '+start);
 return source.slice(a,b);
}
const calendarCode=between('function readCalendarEventsForWrite(){','function pad2(n)');
const favoriteCode=between('function toggleFavorite(id){','function saveQueryHistory(q)');

function calendar({value=null,denied=false}={}){
 const records=new Map();if(value!==null)records.set('calendar',value);
 let writes=0;
 const context={Error,JSON,Set,Array,Date,
  CAL_KEY:'calendar',assertInstitutionalWritable:()=>{},
  readStorageStrict:key=>{
   if(denied)throw new Error('Storage read denied');
   return records.get(key)??null;
  },
  isValidCalendarDate:d=>/^\\d{4}-\\d{2}-\\d{2}$/.test(String(d)),
  writeStorage:(key,value)=>{writes++;records.set(key,value)},
  renderMiniCalendar:()=>{}
 };
 vm.createContext(context);vm.runInContext(calendarCode,context);
 return {context,records,writes:()=>writes};
}
function favorites({value=null,denied=false,initial=[]}={}){
 const records=new Map();if(value!==null)records.set('favorites',value);
 let writes=0;const notices=[];
 const context={Error,JSON,Set,Array,
  state:{favorites:new Set(initial)},validId:id=>/^NEXUS-X-\\d{4}$/.test(id),
  assertInstitutionalWritable:()=>{},
  readStorageStrict:key=>{
   if(denied)throw new Error('Storage read denied');
   return records.get(key)??null;
  },
  writeStorage:(key,value)=>{writes++;records.set('favorites',value)},
  toast:message=>notices.push(message),saveActivity:()=>{},renderInventory:()=>{}
 };
 vm.createContext(context);vm.runInContext(favoriteCode,context);
 return {context,records,notices,writes:()=>writes};
}

test('Calendar: denied local read never rewrites calendar as an empty list',()=>{
 const s=calendar({value:'[{"date":"2026-10-17","text":"Keep"}]',denied:true});
 assert.throws(()=>s.context.readCalendarEventsForWrite(),/Storage read denied/);
 assert.equal(s.writes(),0);
 assert.match(s.records.get('calendar'),/Keep/);
});
test('Calendar: corrupt existing data blocks writes instead of erasing events',()=>{
 const s=calendar({value:'not-json'});
 assert.throws(()=>s.context.readCalendarEventsForWrite(),/corrupto/);
 assert.equal(s.writes(),0);
 assert.equal(s.records.get('calendar'),'not-json');
});
test('Calendar: concurrent tab update prevents stale calendar overwrite',()=>{
 const s=calendar({value:'[{"date":"2026-10-17","text":"A"}]'});
 const snapshot=s.context.readCalendarEventsForWrite();
 snapshot.events.push({date:'2026-10-18',text:'B'});
 s.records.set('calendar','[{"date":"2026-10-17","text":"A"},{"date":"2026-10-19","text":"Other tab"}]');
 assert.throws(()=>s.context.saveCalendarEvents(snapshot.events,{expectedRaw:snapshot.raw}),/otra pestaña/);
 assert.equal(s.writes(),0);
 assert.match(s.records.get('calendar'),/Other tab/);
});
test('Calendar: normal add retains all preexisting events',()=>{
 const s=calendar({value:'[{"date":"2026-10-17","text":"A"}]'});
 const snapshot=s.context.readCalendarEventsForWrite();
 snapshot.events.push({date:'2026-10-19',text:'B'});
 s.context.saveCalendarEvents(snapshot.events,{expectedRaw:snapshot.raw});
 assert.equal(JSON.parse(s.records.get('calendar')).length,2);
 assert.equal(s.writes(),1);
});
test('Calendar: save without storage snapshot is rejected',()=>{
 const s=calendar({value:'[{"date":"2026-10-17","text":"A"}]'});
 assert.throws(()=>s.context.saveCalendarEvents([]),/Falta comprobar/);
 assert.equal(s.writes(),0);
});
test('Favorites: unreadable stored list blocks toggle and preserves state',()=>{
 const s=favorites({value:'["NEXUS-X-0001"]',denied:true,initial:['NEXUS-X-0001']});
 assert.equal(s.context.toggleFavorite('NEXUS-X-0001'),false);
 assert.equal(s.writes(),0);
 assert.equal(s.context.state.favorites.has('NEXUS-X-0001'),true);
});
test('Favorites: another tab changed list, current toggle refreshes instead of overwriting',()=>{
 const s=favorites({
  value:'["NEXUS-X-0001","NEXUS-X-0002"]',initial:['NEXUS-X-0001']
 });
 assert.equal(s.context.toggleFavorite('NEXUS-X-0001'),false);
 assert.equal(s.writes(),0);
 assert.equal(s.context.state.favorites.has('NEXUS-X-0002'),true);
 assert.match(s.notices.join(' '),/otra pestaña/);
});
test('Favorites: malformed storage cannot be overwritten by a valid-looking toggle',()=>{
 const s=favorites({value:'["BAD-IDENTIFIER"]'});
 assert.equal(s.context.toggleFavorite('NEXUS-X-0001'),false);
 assert.equal(s.writes(),0);
 assert.equal(s.records.get('favorites'),'["BAD-IDENTIFIER"]');
});
test('Favorites: healthy toggle saves the complete list and updates UI state',()=>{
 const s=favorites({value:'["NEXUS-X-0001"]',initial:['NEXUS-X-0001']});
 s.context.toggleFavorite('NEXUS-X-0002');
 assert.equal(s.writes(),1);
 assert.equal(s.context.state.favorites.has('NEXUS-X-0002'),true);
 assert.deepEqual(JSON.parse(s.records.get('favorites')),['NEXUS-X-0001','NEXUS-X-0002']);
});
