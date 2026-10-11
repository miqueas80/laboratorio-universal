import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {webcrypto} from 'node:crypto';
const read=p=>readFileSync(resolve(process.cwd(),p),'utf8');
const CORE=read('mesh/core.js'),LOCAL=read('mesh/local.js');
const S1='ws-11111111-2222-4333-8444-555555555555';
const S2='ws-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ID1='doc-11111111-2222-4333-8444-555555555555';
const ID2='doc-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
function runtime({school=S1,db=new Map()}={}){
 const localStorage={
  getItem:key=>db.has(key)?db.get(key):null,
  setItem:(key,value)=>db.set(key,String(value)),
  removeItem:key=>db.delete(key)
 };
 const x={crypto:webcrypto,URL,TextEncoder,TextDecoder,btoa,atob,localStorage,
   location:{href:'https://school.example/universal/',pathname:'/universal/'},
   NexusWorkspaces:{activeId:school,active:()=>({id:school,name:school===S1?'Escuela A':'Escuela B'})}};
 x.globalThis=x;vm.runInNewContext(CORE,x);vm.runInNewContext(LOCAL,x);
 return {core:x.NexusMeshCore,local:x.NexusMeshLocal,db};
}
function metadata(core,school=S1,id=ID1,title='Guía de reacciones químicas'){
 return core.newRecord({title,summary:'Actividades educativas de química para talleres escolares.',attribution:'Equipo docente institucional',
   subject:'quimica',level:'tecnica',license:'CC-BY-4.0',
   accessUrl:'https://recursos.ejemplo.edu.ar/quimica.pdf',keywords:'ciencias, átomos'},school,school===S1?'Escuela A':'Escuela B',id);
}
test('Contrato de publicación: únicamente metadatos educativos permitidos',()=>{
 const {core}=runtime(),r=metadata(core);
 assert.equal(r.schema,1);assert.equal(r.status,'published');
 for(const key of ['inventory','blob','content','text','student','token','gateway'])assert.equal(Object.hasOwn(r,key),false);
 assert.equal(r.publisherId,S1);assert.equal(core.validateRecord(r).id,ID1);
});
test('No se puede indexar contenido, inventario ni alumnos con campos extras',()=>{
 const {core}=runtime(),r=metadata(core);
 assert.throws(()=>core.validateRecord({...r,inventory:[{name:'Ácido'}]}),/esquema inválido/);
 assert.throws(()=>core.validateRecord({...r,documentText:'Contenido privado'}),/esquema inválido/);
 assert.throws(()=>core.validateRecord({...r,title:'Alumno Pérez legajo 1234'}),/datos personales/);
 assert.throws(()=>core.validateRecord({...r,attribution:'persona@gmail.com'}),/datos personales/);
});
test('Se rechazan enlaces inseguros, tokens, usuarios y URLs no públicas',()=>{
 const {core}=runtime(),r=metadata(core);
 for(const u of ['http://ejemplo.edu.ar/a.pdf','https://ejemplo.com/a.pdf?token=123',
   'https://u:p@ejemplo.com/a.pdf','javascript:alert(1)','https://127.0.0.1/documento.pdf',
   'https://ejemplo.com/a.pdf#private']){
  assert.throws(()=>core.validateRecord({...r,accessUrl:u}),/enlace|HTTPS|privado/i,u);
 }
});
test('Licencia y titularidad son obligatorias; el registro no publica sin aceptación',()=>{
 const {core,local}=runtime();
 assert.throws(()=>local.publish({title:'X'},{}),/Confirmá titularidad/);
 const r=metadata(core);
 assert.throws(()=>core.validateRecord({...r,license:'todos-los-derechos-reservados'}),/Licencia/);
 assert.throws(()=>core.validateRecord({...r,subject:'inventario'}),/Nivel o materia/);
});
test('Firma Ed25519 válida, alteración detectada, huella reproducible',async()=>{
 const {core}=runtime();
 const id=await core.createIdentity();
 assert.equal(id.privateKey.extractable,false);
 const record=metadata(core);
 const feed=await core.signFeed(S1,[record],id);
 const verified=await core.verifyFeed(feed);
 assert.equal(verified.feed.records.length,1);assert.equal(verified.feed.records[0].title,record.title);
 assert.equal(verified.fingerprint,await core.fingerprint(feed.publicKey));
 await assert.rejects(core.verifyFeed({...feed,records:[{...record,title:'Material manipulado'}]}),/Firma digital incorrecta/);
});
test('Una escuela no puede incorporar fichas de otras en su catálogo firmado',async()=>{
 const {core}=runtime();const id=await core.createIdentity();
 await assert.rejects(core.signFeed(S1,[metadata(core,S2,ID2)],id),/otra institución/);
});
test('No admite duplicados o esquemas extra en catálogos',async()=>{
 const {core}=runtime(),id=await core.createIdentity(),rec=metadata(core);
 await assert.rejects(core.signFeed(S1,[rec,rec],id),/duplicado/i);
 const ok=await core.signFeed(S1,[rec],id);
 await assert.rejects(core.verifyFeed({...ok,forged:'extra'}),/Formato/);
});
test('Retiro firmado no se revierte con un catálogo viejo',async()=>{
 const {core}=runtime(),a=metadata(core);
 const withdrawn=core.withdrawn(a);
 assert.equal(withdrawn.revision,2);
 const after=core.reconcile([a],[withdrawn]);
 assert.equal(after.accepted,1);assert.equal(after.records[0].status,'withdrawn');
 const stale=core.reconcile(after.records,[a]);
 assert.equal(stale.stale,1);assert.equal(stale.records[0].status,'withdrawn');
 assert.equal(core.queryRecords(stale.records,'quimica').length,0);
});
test('Registros con la misma revisión divergente se retienen como conflicto',()=>{
 const {core}=runtime(),r=metadata(core);
 const diff=core.reconcile([r],[{...r,title:'Versión contraria'}]);
 assert.equal(diff.conflicts[0].reason,'SAME_REVISION_DIVERGED');
 assert.equal(diff.records[0].title,r.title);
});
test('Fijación de clave en primer contacto y protección contra suplantación posterior',async()=>{
 const {core,local}=runtime();
 const owner=await core.createIdentity();
 const document=metadata(core,S2,ID2);
 const feed=await core.signFeed(S2,[document],owner);
 let count=0;
 const imported=await local.importFeed(feed,async ()=>{count++;return true;});
 assert.equal(imported.accepted,1);assert.equal(count,1);
 assert.equal(local.external().length,1);
 const repeated=await local.importFeed(feed,async()=>{throw Error('No debería preguntar al repetir');});
 assert.equal(repeated.identical,1);
 const attacker=await core.createIdentity();
 const forged=await core.signFeed(S2,[document],attacker);
 await assert.rejects(local.importFeed(forged,async()=>true),/cambió su clave/);
 assert.equal(local.external()[0].title,document.title);
});
test('Firma incorrecta nunca llega al diálogo de confianza',async()=>{
 const {core,local}=runtime();
 const owner=await core.createIdentity(),record=metadata(core,S2,ID2);
 const feed=await core.signFeed(S2,[record],owner);
 let prompted=false;
 await assert.rejects(local.importFeed({...feed,records:[{...record,summary:'Texto modificado'}]},async()=>{prompted=true;return true;}),/Firma digital incorrecta/);
 assert.equal(prompted,false);assert.equal(local.external().length,0);
});
test('Búsqueda federada: escuelas distintas, coincidencias relevantes, nada privado',()=>{
 const {core}=runtime();
 const items=[metadata(core,S1,ID1,'Guía de laboratorio'),metadata(core,S2,ID2,'Energía renovable')];
 assert.equal(core.queryRecords(items,'energía').length,1);
 assert.equal(core.queryRecords(items,'energía')[0].publisherId,S2);
 assert.equal(core.queryRecords(items,'nada').length,0);
 assert.equal(core.queryRecords(items,'',{subject:'quimica'}).length,2);
});
test('Producción: interfaz conectada, versión consistente, sin envío automático ni inventarios',()=>{
 const html=read('index.html'),sw=read('sw.js'),app=read('app.js'),ui=read('mesh/ui.js'),local=read('mesh/local.js');
 assert.ok(html.includes('id="meshPublishBtn"'));
 assert.ok(html.includes('id="view-mesh"')&&html.includes('data-view="mesh"'));
 assert.ok(html.indexOf('id="view-mesh"')>html.indexOf('id="view-documents"'));
 assert.ok(html.indexOf('id="view-mesh"')<html.indexOf('id="view-reports"'));
 assert.ok(html.includes('id="meshSearch"'));
 const shell=sw.slice(sw.indexOf('const CORE='),sw.indexOf('const URLS='));
 for(const path of ['./mesh/core.js','./mesh/local.js','./mesh/ui.js']){assert.ok(sw.includes(path));assert.ok(!shell.includes(path));}
 assert.ok(html.includes('src="mesh/loader.js"'));
 assert.ok(app.includes("NexusMeshLoader?.load()"));
 assert.equal(app.match(/trust-registry-lazy-v7/g)?.length,1);
 assert.equal(sw.match(/trust-registry-lazy-v7/g)?.length,1);
 assert.ok(!local.includes('state.inventory')&&!ui.includes('state.inventory'));
 assert.ok(!/fetch\s*\(|XMLHttpRequest|navigator\.sendBeacon/.test(local));
 assert.ok(!html.includes('src="mesh/core.js"'));
 assert.ok(!html.includes('src="mesh/local.js"'));
 assert.ok(!html.includes('src="mesh/ui.js"'));
 const loader=read('mesh/loader.js');
 assert.ok(loader.indexOf("'core.js'")<loader.indexOf("'local.js'"));
 assert.ok(loader.indexOf("'local.js'")<loader.indexOf("'ui.js'"));
});
