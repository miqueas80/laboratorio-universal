import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../backup-recovery-audit.js',import.meta.url),'utf8');
const ctx=vm.createContext({JSON,Array,Number,Object,Error});
vm.runInContext(source,ctx,{filename:'backup-recovery-audit.js'});
const assess=values=>ctx.NexusRecoveryAudit.assess(values);
const marker=overrides=>JSON.stringify({
 schemaVersion:1,phase:'restore-in-progress',records:2,documents:1,
 manifestSha256:'a'.repeat(64),createdAt:'2026-10-16T01:00:00Z',...overrides
});
const input=()=>({
 journalRaw:marker(),
 inventoryRaw:JSON.stringify([{id:'NEXUS-X-0001',name:'INTERNAL SCHOOL SECRET'},
  {id:'NEXUS-X-0002',notes:'PRIVATE INVENTORY NOTE'}]),
 calendarRaw:JSON.stringify([{date:'2026-10-16',text:'PERSONAL CALENDAR DATA'}]),
 favoritesRaw:'["NEXUS-X-0001"]',
 documents:{count:1,originals:1,originalBytes:2048}
});

test('Incident audit: reports matching counts WITHOUT declaring recovery safe',()=>{
 const r=assess(input());
 assert.equal(r.status,'manual-review-required');
 assert.equal(r.journalState,'interrupted');
 assert.equal(r.declared.records,2);
 assert.equal(r.comparisons.inventoryCountMatches,true);
 assert.equal(r.comparisons.documentCountMatches,true);
 assert.match(r.findings.join(' '),/NO pueden certificarse/);
 assert.equal(r.manifestSha256,'a'.repeat(64));
});
test('Incident audit: detects partial records and unavailable IndexedDB without clearing journal',()=>{
 const values=input();
 values.inventoryRaw='[]';
 values.documents={error:'Disk unavailable'};
 const r=assess(values);
 assert.equal(r.comparisons.inventoryCountMatches,false);
 assert.equal(r.observed.documents.state,'unavailable');
 assert.match(r.findings.join(' '),/datos parciales/);
});
test('Incident audit: corrupt or unknown journal requests manual review',()=>{
 for(const raw of ['{','{"phase":"unknown"}','[]','null']){
  const result=assess({...input(),journalRaw:raw});
  assert.equal(result.status,'manual-review-required');
  assert.equal(result.journalState,'invalid');
  assert.equal(result.manifestSha256,null);
 }
});
test('Incident audit: invalid inventory, calendar or favorites are explicitly flagged',()=>{
 const r=assess({...input(),inventoryRaw:'{',calendarRaw:'{}',favoritesRaw:'NaN'});
 assert.equal(r.observed.inventory.state,'invalid');
 assert.equal(r.observed.calendar.state,'invalid');
 assert.equal(r.observed.favorites.state,'invalid');
 assert.match(r.findings.join(' '),/JSON inválid/);
});
test('Incident audit: no journal does not invent a restore incident',()=>{
 const r=assess({...input(),journalRaw:null});
 assert.equal(r.status,'no-interruption-marker');
 assert.equal(r.declared,null);
 assert.equal(r.manifestSha256,null);
});
test('Incident audit: report never copies school names, calendar notes or document binary',()=>{
 const values=input();
 const report=JSON.stringify(assess(values));
 for(const forbidden of [
  'INTERNAL SCHOOL SECRET','PRIVATE INVENTORY NOTE','PERSONAL CALENDAR DATA',
  'NEXUS-X-0001','NEXUS-X-0002'
 ])assert.ok(!report.includes(forbidden),'Sensitive data leaked: '+forbidden);
 assert.deepEqual(values,input(),'pure assessor cannot mutate its inputs');
});
test('Incident audit: forged negative or inconsistent counts are marked unavailable',()=>{
 const x=assess({...input(),documents:{count:-1,originals:7,originalBytes:1}});
 assert.equal(x.observed.documents.state,'unavailable');
 const y=assess({...input(),documents:{count:1,originals:2,originalBytes:1}});
 assert.equal(y.observed.documents.state,'unavailable');
});
