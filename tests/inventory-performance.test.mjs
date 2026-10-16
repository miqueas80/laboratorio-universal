import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
function section(startName,endName){
 const start=app.indexOf(startName),end=app.indexOf(endName,start);
 assert.ok(start>=0&&end>start,'Missing production section '+startName);
 return app.slice(start,end);
}
const srcValid=section('function validId(','function toast(');
const srcValidate=section('function validateInventory(','function normalizeRecord(');
const srcIntegrity=section('function runIntegrity()','let diagnosticSnapshot=');
const context=vm.createContext({state:{inventory:[]}});
vm.runInContext([srcValid,srcValidate,srcIntegrity,
 'this.validateInventory=validateInventory;this.runIntegrity=runIntegrity;'].join('\n'),context);
const validate=(records,expected=null)=>{
 try{return {ok:context.validateInventory(records,expected)}}catch(e){return {error:e.message}}
};
const integrity=records=>{
 context.state.inventory=records;
 return JSON.parse(JSON.stringify(context.runIntegrity()));
};
const legacyValidate=(records,expected=null)=>{
 try{
  if(!Array.isArray(records))throw new Error('La base no contiene un arreglo de registros.');
  if(records.some(r=>!r||typeof r!=='object'||!String(r.name||'').trim()))throw new Error('Hay registros sin nombre válido.');
  const ids=records.map(x=>x.id);
  const dup=ids.filter((x,i)=>ids.indexOf(x)!==i);
  if(dup.length)throw new Error('IDs duplicados: '+[...new Set(dup)].join(', '));
  const bad=records.filter(x=>!/^NEXUS-X-\d{4}$/.test(String(x.id||'')));
  if(bad.length)throw new Error('Hay '+bad.length+' IDs con formato inválido.');
  if(expected!==null&&records.length!==expected)throw new Error('Se esperaban '+expected+' registros y llegaron '+records.length+'.');
  return {ok:true};
 }catch(e){return {error:e.message}}
};
const legacyIntegrity=records=>{
 const ids=records.map(x=>String(x.id||'').trim().toUpperCase());
 const unique=new Set(ids);
 const duplicates=ids.filter((x,i)=>x&&ids.indexOf(x)!==i);
 const valid=ids.every(Boolean)&&ids.every(id=>/^NEXUS-X-\d{4}$/.test(String(id||'')))&&unique.size===ids.length;
 return {ok:valid,recordCount:ids.length,first:ids[0]||null,last:ids.at(-1)||null,uniqueIds:unique.size,duplicateIds:[...new Set(duplicates)],identityRule:'1 registro = 1 ID NEXUS-X'};
};
const record=(id,name='Material de prueba')=>({id,name});
const many=count=>Array.from({length:count},(_,i)=>record('NEXUS-X-'+String(i+1).padStart(4,'0'),'Material '+i));

test('Inventario: validación optimizada conserva las reglas originales y el orden de errores',()=>{
 for(const sample of [
  [],[record('NEXUS-X-0001')],
  [record('NEXUS-X-0001'),record('NEXUS-X-0002'),record('NEXUS-X-0001')],
  [record('NEXUS-X-0001'),record('NEXUS-X-0002'),record('NEXUS-X-0001'),record('NEXUS-X-0002')],
  [record('bad')],[record('NEXUS-X-0001','')],
  [record('NEXUS-X-0001'),record('NEXUS-X-0002'),record('NEXUS-X-0003')],
  many(1000)
 ])for(const expected of [null,1,2]){
  assert.deepEqual(validate(sample,expected),legacyValidate(sample,expected));
 }
});

test('Inventario: diagnóstico de identidad mantiene exactamente los campos y duplicados históricos',()=>{
 for(const sample of [
  [],many(1),many(1000),
  [record('nexus-x-0001'),record('NEXUS-X-0001'),record('NEXUS-X-0001')],
  [record('NEXUS-X-0001'),record(' '),record('NEXUS-X-0002'),record(' ')],
  [record('NEXUS-X-0001'),record('NEXUS-X-0002'),record('NEXUS-X-0001')],
  [record('NEXUS-X-0001'),record('NEXUS-X-0002'),record('NEXUS-X-0003'),record('NEXUS-X-0002')]
 ])assert.deepEqual(integrity(sample),legacyIntegrity(sample));
});

test('Inventario: eliminación explícita de búsqueda cuadrática en ambos verificadores',()=>{
 assert.doesNotMatch(srcValidate,/\bindexOf\s*\(/);
 assert.doesNotMatch(srcIntegrity,/\bindexOf\s*\(/);
 assert.match(srcValidate,/seen\.has\(id\)/);
 assert.match(srcIntegrity,/unique\.has\(id\)/);
});

test('Inventario: miles de registros conservan identidades únicas sin contaminar los datos',()=>{
 const records=many(8000);
 assert.deepEqual(validate(records),{ok:true});
 const result=integrity(records);
 assert.equal(result.ok,true);
 assert.equal(result.recordCount,8000);
 assert.equal(result.uniqueIds,8000);
 assert.deepEqual(result.duplicateIds,[]);
 assert.equal(result.first,'NEXUS-X-0001');
 assert.equal(result.last,'NEXUS-X-8000');
});
