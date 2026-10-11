import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
const root=resolve(import.meta.dirname,'..');
const source=path=>readFileSync(resolve(root,path),'utf8');
const ids={
 a:'ws-aaaaaaaa-0000-4000-8000-000000000101',
 b:'ws-bbbbbbbb-0000-4000-8000-000000000202',
 c:'ws-cccccccc-0000-4000-8000-000000000303'
};
function device(role){
 const data=new Map([['nexus-mesh:two-devices:role:'+encodeURIComponent('/pilot/'),role]]);
 let reloads=0;
 const context={
  crypto:webcrypto,URL,TextEncoder,TextDecoder,btoa,atob,Promise,
  location:{href:'https://test.example/pilot/MALLA-FEDERAL-DOS-CELULARES.html',reload:()=>{reloads++;}},
  navigator:{onLine:false},
  localStorage:{getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),
    removeItem:key=>data.delete(key)},
  indexedDB:null
 };
 context.globalThis=context;
 for(const file of ['pilot/bootstrap.js','mesh/core.js','mesh/local.js','mesh/registry.js'])
  vm.runInNewContext(source(file),context,{filename:file});
 return {context,store:data,local:context.NexusMeshLocal,core:context.NexusMeshCore,
  choose:context.NexusPilotRole.choose,reloads:()=>reloads};
}
async function catalogue(device,label){
 const id=ids[label],key=await device.core.createIdentity();
 const record=device.core.newRecord({
  title:label==='a'?'Circuitos y energía renovable':'Reacciones químicas',
  summary:'Descripción ficticia de un recurso compartido.',
  subject:label==='a'?'fisica':'quimica',
  level:'tecnica',license:'CC-BY-4.0',attribution:'Equipo docente ficticio',
  accessUrl:'https://recursos.example.org/nexus/guia.pdf',
  keywords:'energia, quimica'
 },id,'Escuela '+label.toUpperCase(),'doc-'+label.repeat(8)+'-0000-4000-8000-000000000202');
 const feed=await device.core.signFeed(id,[record],key);
 return {key,record,feed};
}
const serialize=file=>JSON.parse(JSON.stringify(file));
test('Dos celulares independientes: A -> B usando JSON firmado, sin red',async()=>{
 const a=device('a'),b=device('b');
 assert.equal(a.local.activeId,ids.a);assert.equal(b.local.activeId,ids.b);
 const file=serialize((await catalogue(a,'a')).feed);
 let approved=0;const result=await b.local.importFeed(file,async({fingerprint,publisherId})=>{
  approved++;assert.equal(publisherId,ids.a);assert.equal(fingerprint,(await a.core.verifyFeed(file)).fingerprint);return true;
 });
 assert.equal(result.accepted,1);assert.equal(approved,1);
 assert.equal((await b.local.searchVerified('energia')).length,1);
 assert.equal((await a.local.searchVerified('energia')).length,0);
 assert.ok([...b.store.keys()].some(k=>k.includes('verified-feeds-v2:')));
});
test('Dos celulares independientes: B -> A con firma distinta',async()=>{
 const a=device('a'),b=device('b');
 const feed=serialize((await catalogue(b,'b')).feed);
 await a.local.importFeed(feed,async()=>true);
 assert.equal((await a.local.searchVerified('reacciones')).length,1);
 assert.equal((await b.local.searchVerified('reacciones')).length,0);
});
test('El retiro firmado viaja como nueva revisión: receptor deja de mostrar la ficha',async()=>{
 const a=device('a'),b=device('b');
 const data=await catalogue(a,'a');
 await b.local.importFeed(serialize(data.feed),async()=>true);
 const withdrawn=a.core.withdrawn(data.record);
 const next=await a.core.signFeed(ids.a,[withdrawn],data.key);
 assert.equal((await b.local.searchVerified('energia')).length,1);
 await b.local.importFeed(serialize(next),async()=>true);
 assert.equal((await b.local.searchVerified('energia')).length,0);
 await assert.rejects(b.local.importFeed(serialize(data.feed),async()=>true),/retroceder/);
});
test('Una ficha falsificada, clave cambiada y catálogo propio se rechazan',async()=>{
 const a=device('a'),b=device('b');
 const data=await catalogue(a,'a');
 const evil=serialize(data.feed);evil.records[0].title='Material inventado';
 await assert.rejects(b.local.importFeed(evil,async()=>true),/Firma digital incorrecta/);
 await b.local.importFeed(serialize(data.feed),async()=>true);
 const other=await a.core.createIdentity();
 const spoof=await a.core.signFeed(ids.a,[data.record],other);
 await assert.rejects(b.local.importFeed(serialize(spoof),async()=>true),/cambió su clave/);
 await assert.rejects(a.local.importFeed(serialize(data.feed),async()=>true),/No importes un catálogo propio/);
 assert.equal((await b.local.searchVerified('energia')).length,1);
});
test('Cambiar la escuela obliga a recargar; almacenes separados por rol',()=>{
 const a=device('a');a.choose('b');
 assert.equal(a.reloads(),1);
 assert.ok([...a.store.values()].includes('b'));
 const c=device('c');assert.equal(c.local.activeId,ids.c);
});
test('La interfaz no hace peticiones de red y exige importación explícita',()=>{
 const ui=source('pilot/device.js'),markup=source('pilot/index.html');
 for(const needle of ['mesh.importFeed(raw','mesh.exportFeed()','mesh.searchVerified(term',
  'mesh.withdraw(first.id)','core.verifyFeed(raw)','No aceptes si difieren'])
  assert.ok(ui.includes(needle),needle);
 assert.ok(!/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/.test(ui));
 assert.ok(!/script src="[^"]*app\.js"/i.test(markup));
 for(const id of ['role','choose','create','export','withdraw','import','file','search','find','fingerprint'])
  assert.ok(markup.includes('id="'+id+'"'),id);
});
test('Paquete portátil incluye bibliotecas originales y no depende de scripts externos',()=>{
 const f=resolve(root,'dist/MALLA-FEDERAL-DOS-CELULARES.html');
 if(!existsSync(f))return;
 const html=readFileSync(f,'utf8');
 assert.ok(html.includes('root.NexusMeshCore='));
 assert.ok(html.includes('root.NexusMeshLocal='));
 assert.ok(html.includes('root.NexusPilotRole='));
 assert.ok(html.includes('mesh.exportFeed()'));
 assert.ok(!/<script\b[^>]*src\s*=/i.test(html));
 assert.ok(html.length<220000);
});
