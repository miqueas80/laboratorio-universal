import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {webcrypto} from 'node:crypto';
import {createIngestionPlan,cleanQuery,pagination,FederationError} from '../federator/policy.mjs';
import handler from '../federator/worker.mjs';

if(!globalThis.crypto)globalThis.crypto=webcrypto;
const core=globalThis.NexusMeshCore;
const schema=readFileSync(new URL('../federator/schema.sql',import.meta.url),'utf8');
const A='ws-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const B='ws-11111111-2222-4333-8444-555555555555';
const D1='doc-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const D2='doc-11111111-2222-4333-8444-555555555555';
const base='https://federador.example';

class DB {
 constructor(){
  this.db=new DatabaseSync(':memory:');
  this.db.exec(schema);
 }
 prepare(sql){
  const database=this.db;
  return {bind(...args){
   return {
    _run:()=>database.prepare(sql).run(...args),
    async first(){return database.prepare(sql).get(...args)||null;},
    async all(){return {results:database.prepare(sql).all(...args)};},
    async run(){return database.prepare(sql).run(...args);}
   };
  }};
 }
 async batch(statements){
  this.db.exec('BEGIN');
  try{for(const stmt of statements)stmt._run();this.db.exec('COMMIT');return [];}
  catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 enroll(id,key,active=1){
  this.db.prepare('INSERT INTO publishers(publisher_id,display_name,public_key,verified_by,verification_note,active) VALUES(?,?,?,?,?,?)')
   .run(id,'Escuela autorizada',key,'verificacion-manual','Ensayo sintético; huella comprobada fuera de banda',active);
 }
 resources(id=A){return this.db.prepare('SELECT resource_id,revision,status,record_json FROM resources WHERE publisher_id=? ORDER BY resource_id').all(id);}
 epoch(id=A){return this.db.prepare('SELECT epoch FROM publishers WHERE publisher_id=?').get(id)?.epoch??null;}
 close(){this.db.close();}
}
const make=(school,id,title,rev=1)=>core.newRecord({
 title,summary:'Material de laboratorio para docentes de ciencias y tecnología.',
 subject:'quimica',level:'tecnica',license:'CC-BY-4.0',attribution:'Equipo docente',
 accessUrl:'https://recursos.example.edu/guia.pdf',keywords:'ciencias, laboratorio'
 },school,'Escuela de Prueba',id,rev);
const publish=async (identity,items,school=A)=>core.signFeed(school,items,identity);
const req=(method,path,body,contentType='application/json')=>new Request(base+path,{
 method,headers:body===undefined?{}:{'content-type':contentType},
 ...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})
});
const call=(db,method,path,body)=>handler.fetch(req(method,path,body),{DB:db});
async function ready(){
 const db=new DB(),identity=await core.createIdentity();
 db.enroll(A,identity.publicKeyRaw);
 return {db,identity};
}
test('El esquema D1 crea FTS5, tabla de claves y restricciones de institución',()=>{
 const d=new DB();
 const tables=d.db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','trigger')").all().map(x=>x.name);
 for(const name of ['publishers','resources','feeds','resource_fts','resources_authorize_insert','resources_revision_guard'])assert.ok(tables.includes(name),name);
 assert.equal(d.resources().length,0);
 d.close();
});
test('Solo aceptamos catálogos firmados por una escuela registrada y activa',async()=>{
 const {db,identity}=await ready();
 const record=make(A,D1,'Reacciones químicas');
 const feed=await publish(identity,[record]);
 const response=await call(db,'POST','/api/v1/ingest',feed);
 assert.equal(response.status,200);
 const body=await response.json();
 assert.deepEqual([body.ok,body.kind,body.accepted,body.total],[true,'commit',1,1]);
 assert.equal(db.resources().length,1);
 assert.equal(db.epoch(),1);
 db.close();
});
test('La búsqueda FTS localiza material público; la respuesta refiere a catálogo firmado verificable',async()=>{
 const {db,identity}=await ready();
 const feed=await publish(identity,[make(A,D1,'Energía en química'),make(A,D2,'Tabla periódica')]);
 assert.equal((await call(db,'POST','/api/v1/ingest',feed)).status,200);
 const query=await call(db,'GET','/api/v1/search?q=energia&subject=quimica&limit=1');
 assert.equal(query.status,200);
 assert.equal(query.headers.get('Access-Control-Allow-Origin'),'*');
 const data=await query.json();
 assert.equal(data.results.length,1);
 assert.equal(data.results[0].record.title,'Energía en química');
 assert.ok(data.results[0].catalogUrl.endsWith('/api/v1/catalog/'+A));
 const result=await call(db,'GET','/api/v1/catalog/'+A);
 assert.equal(result.status,200);
 const raw=await result.json();
 const verified=await core.verifyFeed(raw);
 assert.equal(verified.feed.publisherId,A);
 db.close();
});
test('Un feed idéntico es idempotente sin actualizar la revisión global',async()=>{
 const {db,identity}=await ready();const signed=await publish(identity,[make(A,D1,'Material académico')]);
 await call(db,'POST','/api/v1/ingest',signed);
 const replay=await call(db,'POST','/api/v1/ingest',signed);
 assert.equal((await replay.json()).kind,'replay');
 assert.equal(db.epoch(),1);
 assert.equal(db.resources().length,1);
 db.close();
});
test('Firmas falsificadas y cambios de clave de escuela se rechazan',async()=>{
 const {db,identity}=await ready();
 const attacker=await core.createIdentity();
 const original=await publish(identity,[make(A,D1,'Microscopio digital')]);
 const forged={...original,records:[{...original.records[0],title:'Falso'}]};
 let response=await call(db,'POST','/api/v1/ingest',forged);
 assert.equal(response.status,400);assert.equal((await response.json()).code,'BAD_SIGNATURE');
 const signedAttacker=await publish(attacker,[make(A,D1,'Microscopio digital')]);
 response=await call(db,'POST','/api/v1/ingest',signedAttacker);
 assert.equal(response.status,403);assert.equal((await response.json()).code,'KEY_MISMATCH');
 assert.equal(db.resources().length,0);
 db.close();
});
test('Omisión de recursos existentes sin aviso firmado se bloquea',async()=>{
 const {db,identity}=await ready();
 await call(db,'POST','/api/v1/ingest',await publish(identity,[make(A,D1,'Guía 1'),make(A,D2,'Guía 2')]));
 const omission=await publish(identity,[make(A,D1,'Guía 1')]);
 const response=await call(db,'POST','/api/v1/ingest',omission);
 assert.equal(response.status,409);
 assert.equal((await response.json()).code,'INCOMPLETE_SNAPSHOT');
 assert.equal(db.resources().length,2);
 db.close();
});
test('Los retiros versionados desaparecen de la búsqueda y las versiones antiguas no reaparecen',async()=>{
 const {db,identity}=await ready();
 const record=make(A,D1,'Análisis de química');
 const signed=await publish(identity,[record]);
 await call(db,'POST','/api/v1/ingest',signed);
 const withdrawn=core.withdrawn(record);
 let response=await call(db,'POST','/api/v1/ingest',await publish(identity,[withdrawn]));
 assert.equal(response.status,200);
 assert.equal(db.resources()[0].status,'withdrawn');
 assert.equal((await (await call(db,'GET','/api/v1/search?q=quimica')).json()).results.length,0);
 response=await call(db,'POST','/api/v1/ingest',signed);
 assert.equal(response.status,409);
 assert.equal((await response.json()).code,'ROLLBACK');
 db.close();
});
test('Una revisión posterior no puede resucitar un ID retirado: exige nuevo ID',async()=>{
 const {db,identity}=await ready();const initial=make(A,D1,'Biólogos del laboratorio');
 await call(db,'POST','/api/v1/ingest',await publish(identity,[initial]));
 await call(db,'POST','/api/v1/ingest',await publish(identity,[core.withdrawn(initial)]));
 const resurrect=make(A,D1,'Biólogos del laboratorio',3);
 const response=await call(db,'POST','/api/v1/ingest',await publish(identity,[resurrect]));
 assert.equal((await response.json()).code,'WITHDRAWN_REUSED');
 db.close();
});
test('Revocación institucional bloquea publicación, catálogo y búsqueda',async()=>{
 const {db,identity}=await ready();
 const record=make(A,D1,'Reactivos de clase');
 await call(db,'POST','/api/v1/ingest',await publish(identity,[record]));
 db.db.prepare('UPDATE publishers SET active=0 WHERE publisher_id=?').run(A);
 assert.equal((await call(db,'GET','/api/v1/catalog/'+A)).status,404);
 assert.equal((await (await call(db,'GET','/api/v1/search?q=reactivos')).json()).results.length,0);
 const reingest=await call(db,'POST','/api/v1/ingest',await publish(identity,[record]));
 assert.equal(reingest.status,403);
 db.close();
});
test('El CAS evita carreras entre publicaciones del mismo editor',async()=>{
 const {db,identity}=await ready();
 const stmt='UPDATE publishers SET epoch=CASE WHEN epoch=? AND active=1 AND public_key=? THEN epoch+1 ELSE NULL END WHERE publisher_id=?';
 const first=db.prepare(stmt).bind(0,identity.publicKeyRaw,A);
 const stale=db.prepare(stmt).bind(0,identity.publicKeyRaw,A);
 await db.batch([first]);
 await assert.rejects(db.batch([stale]));
 assert.equal(db.epoch(),1);
 db.close();
});
test('La transacción aborta todos los registros cuando un documento viola restricciones',async()=>{
 const {db,identity}=await ready();
 const insert='INSERT INTO resources(publisher_id,resource_id,revision,status,signer_public_key,record_json,updated_at) VALUES(?,?,?,?,?,?,?)';
 const good=db.prepare(insert).bind(A,D1,1,'published',identity.publicKeyRaw,'{}','2026-10-11T00:00:00.000Z');
 const bad=db.prepare(insert).bind(B,D2,1,'published',identity.publicKeyRaw,'{}','2026-10-11T00:00:00.000Z');
 await assert.rejects(db.batch([good,bad]));
 assert.equal(db.resources().length,0);
 db.close();
});
test('Consultas paginadas por cursor numérico; sin exponer recursos de instituciones suspendidas',async()=>{
 const {db,identity}=await ready();
 await call(db,'POST','/api/v1/ingest',await publish(identity,[make(A,D1,'Guía de laboratorio'),make(A,D2,'Átomos de carbono')]));
 const first=await(await call(db,'GET','/api/v1/search?limit=1')).json();
 assert.equal(first.results.length,1);assert.equal(first.hasMore,true);
 const second=await(await call(db,'GET','/api/v1/search?limit=1&cursor='+first.cursor)).json();
 assert.equal(second.results.length,1);assert.equal(second.hasMore,false);
 assert.notEqual(first.results[0].record.id,second.results[0].record.id);
 db.close();
});
test('No se permite inyectar expresiones FTS, SQL ni paginación descontrolada',async()=>{
 assert.throws(()=>cleanQuery('quimica OR "todas"'),FederationError);
 assert.throws(()=>cleanQuery('a'.repeat(40)),FederationError);
 assert.equal(cleanQuery('ácido nítrico'),'"acido" AND "nitrico"');
 const url=new URL(base+'/api/v1/search?cursor=10&limit=25');
 assert.deepEqual(pagination(url),{cursor:10,limit:25});
 const d=new DB();
 assert.equal((await call(d,'GET','/api/v1/search?limit=1000')).status,400);
 assert.equal((await call(d,'GET','/api/v1/search?q=foo%22')).status,400);
 d.close();
});
test('HTTP rechaza publicadores no inscritos y operaciones CORS sin exponer secretos',async()=>{
 const db=new DB(),unknown=await core.createIdentity();
 const feed=await publish(unknown,[make(B,D2,'Biología')],B);
 const response=await call(db,'POST','/api/v1/ingest',feed);
 assert.equal(response.status,403);
 assert.equal(response.headers.get('Access-Control-Allow-Origin'),null);
 const preflight=await call(db,'OPTIONS','/api/v1/ingest');
 assert.equal(preflight.status,405);
 assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),null);
 assert.equal((await call(db,'GET','/health')).status,200);
 db.close();
});
test('El límite de tamaño rechaza cargas enormes antes de procesar JSON',async()=>{
 const db=new DB();
 const giant=' '.repeat(3*1024*1024+1);
 const response=await call(db,'POST','/api/v1/ingest',giant);
 assert.equal(response.status,413);
 assert.equal(db.resources().length,0);
 db.close();
});
test('La PWA conserva su Service Worker sin cargar el servidor opcional',()=>{
 const service=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
 const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.ok(!service.includes('federator/worker.mjs'));
 assert.ok(!index.includes('federator/worker.mjs'));
 assert.ok(!schema.includes('inventario_escolar'));
});

test('El piloto gratuito limita a 32 cambios nuevos por petición firmada',async()=>{
 const {db,identity}=await ready();
 const records=Array.from({length:33},(_,i)=>make(A,
  'doc-aaaaaaaa-bbbb-4ccc-8ddd-'+String(i+1).padStart(12,'0'),
  'Material educativo '+(i+1)));
 const feed=await publish(identity,records);
 const response=await call(db,'POST','/api/v1/ingest',feed);
 assert.equal(response.status,413);
 assert.equal((await response.json()).code,'PILOT_BATCH_LIMIT');
 assert.equal(db.resources().length,0);assert.equal(db.epoch(),0);
 db.close();
});
