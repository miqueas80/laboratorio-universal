import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../federator/worker.mjs';

const sql=readFileSync(new URL('../federator/schema.sql',import.meta.url),'utf8');
const origin='https://federador-test.example';
const COUNT=10000,SCHOOLS=8;
const id=i=>'ws-'+i.toString(16).padStart(8,'0')+'-1111-4111-8111-111111111111';
const doc=i=>'doc-'+i.toString(16).padStart(8,'0')+'-2222-4222-8222-222222222222';
function setup(){
 const database=new DatabaseSync(':memory:');
 database.exec(sql);
 const school=database.prepare('INSERT INTO publishers(publisher_id,display_name,public_key,verified_by,active) VALUES(?,?,?,?,1)');
 const insert=database.prepare('INSERT INTO resources(publisher_id,resource_id,revision,status,signer_public_key,record_json,title,summary,subject,level,license,attribution,keywords,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
 database.exec('BEGIN');
 try{
  for(let k=0;k<SCHOOLS;k++)school.run(id(k),'Escuela sintética '+k,'A'.repeat(43),'test-sintetico');
  for(let i=0;i<COUNT;i++){
   const schoolId=id(i%SCHOOLS),energy=i%2===0;
   const title=energy?'Energía solar y electrónica '+i:'Formulación química '+i;
   const meta={schema:1,id:doc(i),revision:1,status:'published',publisherId:schoolId,
    publisherName:'Escuela sintética',title,
    summary:energy?'Actividades de física aplicada':'Guías para formulación química',
    subject:energy?'fisica':'quimica',level:'tecnica',license:'CC-BY-4.0',
    attribution:'Docentes del ensayo',accessUrl:'https://recursos.example/guia.pdf',
    updatedAt:'2026-10-11T00:00:00.000Z',keywords:energy?['energia','electricidad']:['quimica','compuestos']};
   insert.run(schoolId,doc(i),1,'published','A'.repeat(43),JSON.stringify(meta),
    title,meta.summary,meta.subject,meta.level,meta.license,meta.attribution,
    meta.keywords.join(' '),meta.updatedAt);
  }
  database.exec('COMMIT');
 }catch(error){database.exec('ROLLBACK');throw error;}
 const adapter={
  prepare(q){return {bind(...args){return {
   first:async()=>database.prepare(q).get(...args)||null,
   all:async()=>({results:database.prepare(q).all(...args)})
  };}}},
  batch:async()=>{throw Error('No se usa ingesta en este benchmark');}
 };
 const request=async path=>{
  const response=await worker.fetch(new Request(origin+path),{DB:adapter});
  return {status:response.status,data:await response.json()};
 };
 return {database,request};
}
test('Índice nacional piloto: 10.000 fichas sintéticas distribuidas entre ocho escuelas',async()=>{
 const env=setup();
 try{
  assert.equal(env.database.prepare('SELECT COUNT(*) AS total FROM resources').get().total,COUNT);
  assert.equal(env.database.prepare('SELECT COUNT(*) AS total FROM resource_fts WHERE resource_fts MATCH ?').get('energia').total,COUNT/2);
  const first=await env.request('/api/v1/search?q=energia&limit=100');
  assert.equal(first.status,200);
  assert.equal(first.data.results.length,100);
  assert.equal(first.data.hasMore,true);
  const ids=new Set(first.data.results.map(x=>x.record.id));
  assert.equal(ids.size,100);
  const next=await env.request('/api/v1/search?q=energia&limit=100&cursor='+first.data.cursor);
  assert.equal(next.status,200);
  assert.equal(next.data.results.length,100);
  for(const x of next.data.results)assert.ok(!ids.has(x.record.id),'Paginación duplicó un documento');
  assert.equal(next.data.results.every(x=>x.record.subject==='fisica'),true);
 }finally{env.database.close();}
});
test('Revocación de escuela elimina sus recursos del buscador público inmediatamente',async()=>{
 const env=setup();
 try{
  const target=id(0);
  const before=await env.request('/api/v1/search?publisherId='+target+'&limit=25');
  assert.equal(before.status,200);assert.equal(before.data.results.length,25);
  env.database.prepare('UPDATE publishers SET active=0 WHERE publisher_id=?').run(target);
  const after=await env.request('/api/v1/search?publisherId='+target+'&limit=25');
  assert.equal(after.status,200);assert.equal(after.data.results.length,0);
  assert.equal((await env.request('/api/v1/catalog/'+target)).status,404);
  assert.equal(env.database.prepare('SELECT COUNT(*) AS total FROM resources').get().total,COUNT);
 }finally{env.database.close();}
});
