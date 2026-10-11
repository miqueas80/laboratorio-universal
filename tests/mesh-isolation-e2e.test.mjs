import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';

const srcFile=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const ids=[
 'ws-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
 'ws-11111111-2222-4333-8444-555555555555',
 'ws-99999999-8888-4777-8666-555555555555'
];
const docs=[
 'doc-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
 'doc-11111111-2222-4333-8444-555555555555',
 'doc-99999999-8888-4777-8666-555555555555'
];
const fakeNames=['Escuela A','Escuela B','Escuela C'];
const today=()=>Date.now();
const iso=days=>new Date(today()+days*86400000).toISOString();
function runtime(workspace,storage=new Map()){
 let requested=[],response=null,shift=0;
 class Clock extends Date {static now(){return Date.now()+shift;}}
 const root={crypto:webcrypto,URL,TextEncoder,TextDecoder,btoa,atob,Blob,AbortController,setTimeout,clearTimeout,Date:Clock,
  location:{href:'https://nexus.example.ar/sistema/',pathname:'/sistema/'},navigator:{onLine:true},
  NexusWorkspaces:{activeId:workspace,active:()=>({id:workspace,name:fakeNames[ids.indexOf(workspace)]||'Personal'})},
  localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value))},
  fetch:async (uri,options)=>{
   requested.push({uri,options});
   if(!response)throw Error('Sin respuesta configurada.');
   return new Response(JSON.stringify(response),{status:200,headers:{'content-type':'application/json'}});
  }};
 root.globalThis=root;
 for(const file of ['mesh/core.js','mesh/local.js','mesh/registry.js','mesh/network.js'])
  vm.runInNewContext(srcFile(file),root,{filename:file});
 return {id:workspace,root,storage,core:root.NexusMeshCore,local:root.NexusMeshLocal,
  registry:root.NexusMeshRegistry,network:root.NexusMeshNetwork,
  setResponse:value=>{response=value;},requested:()=>requested,advanceDays:n=>{shift+=n*86400000;}};
}
async function institution(r,id,title,index){
 const signing=await r.core.createIdentity();
 const rec=r.core.newRecord({title,summary:'Recurso educativo autorizado para instituciones docentes.',
  subject:'quimica',level:'tecnica',license:'CC-BY-4.0',attribution:'Docentes',
  accessUrl:'https://publico.example.ar/guia.pdf',keywords:'quimica, laboratorio'
 },id,'Escuela '+String.fromCharCode(65+index),docs[index]);
 const feed=await r.core.signFeed(id,[rec],signing);
 return {signing,rec,feed};
}
async function authority(r,owner,schools,sequence=1){
 return r.registry.sign({
  sequence,authorityName:'Red Federal Piloto Independiente',
  issuedAt:iso(-1),expiresAt:iso(15),
  institutions:schools.map(({school,status='active'})=>({publisherId:school.feed.publisherId,
    name:school.rec.publisherName,publicKey:school.feed.publicKey,status}))
 },owner);
}
test('Escuelas A, B y C: A puede consultar dos catálogos firmados sin Internet',async()=>{
 const storage=new Map(),a=runtime(ids[0],storage),b=await institution(a,ids[1],'Átomos y moléculas',1),
  c=await institution(a,ids[2],'Tabla periódica compartida',2);
 let confirmations=0;
 await a.local.importFeed(b.feed,async()=>{confirmations++;return true;});
 await a.local.importFeed(c.feed,async()=>{confirmations++;return true;});
 assert.equal(confirmations,2);
 a.root.navigator.onLine=false;
 const hits=await a.local.searchVerified('',{subject:'quimica'});
 assert.deepEqual(new Set(hits.map(r=>r.publisherId)),new Set([ids[1],ids[2]]));
 assert.equal(a.requested().length,0);
});
test('Dos espacios de escuela en mismo navegador no comparten biblioteca, huellas ni suscripciones',async()=>{
 const storage=new Map(),a=runtime(ids[0],storage),b=runtime(ids[1],storage);
 const school=await institution(a,ids[2],'Química ambiental',2);
 await a.local.importFeed(school.feed,async()=>true);
 assert.equal((await a.local.searchVerified('')).length,1);
 assert.equal((await b.local.searchVerified('')).length,0);
 assert.equal(b.local.external().length,0);
 assert.equal(Object.keys(b.local.pins()).length,0);
 a.setResponse(school.feed);
 await a.network.fetchCatalogue('https://escuela-c.example.ar/catalogo.json',async()=>true);
 assert.equal(a.network.sources().length,1);
 assert.equal(b.network.sources().length,0);
 assert.equal(b.requested().length,0);
});
test('El registro de autoridad no hereda confianza de otra escuela en el mismo dispositivo',async()=>{
 const storage=new Map(),a=runtime(ids[0],storage),b=runtime(ids[1],storage);
 const school=await institution(a,ids[2],'Biología compartida',2);
 const signing=await a.core.createIdentity();
 await a.registry.install(await authority(a,signing,[{school}]),async()=>true);
 assert.ok(a.registry.info()?.fingerprint);
 assert.equal(b.registry.info(),null);
 await assert.rejects(b.local.importFeed(school.feed,async()=>false),/No se autorizó confiar/);
});
test('Escuela suspendida desaparece inmediatamente de búsqueda offline sin borrar recursos propios',async()=>{
 const a=runtime(ids[0]),school=await institution(a,ids[1],'Química compartida',1);
 const me=a.local.publish({title:'Protocolo de clase local',summary:'Material autorizado para la escuela.',
  subject:'quimica',level:'tecnica',license:'CC-BY-4.0',attribution:'Equipo docente',
  accessUrl:'https://recursos.example.ar/protocolo.pdf',keywords:'clase'},
  {ownerConfirmed:true,noPersonalDataConfirmed:true});
 await a.local.importFeed(school.feed,async()=>true);
 const owner=await a.core.createIdentity();
 await a.registry.install(await authority(a,owner,[{school}]),async()=>true);
 assert.equal((await a.local.searchVerified('')).length,2);
 await a.registry.install(await authority(a,owner,[{school,status:'suspended'}],2),async()=>true);
 const after=await a.local.searchVerified('');
 assert.equal(after.length,1);
 assert.equal(after[0].id,me.id);
 assert.equal(a.local.external().length,1); // Archive remains; trust revoked in search.
 assert.equal(a.requested().length,0);
});
test('Clave cambiada por autoridad reconocida bloquea datos antiguos aunque estén cacheados',async()=>{
 const a=runtime(ids[0]),school=await institution(a,ids[1],'Física experimental',1);
 await a.local.importFeed(school.feed,async()=>true);
 const owner=await a.core.createIdentity();
 await a.registry.install(await authority(a,owner,[{school}]),async()=>true);
 const other=await a.core.createIdentity();
 const changed={...school,feed:{...school.feed,publicKey:other.publicKeyRaw}};
 await a.registry.install(await authority(a,owner,[{school:changed}],2),async()=>true);
 assert.equal((await a.local.searchVerified('')).length,0);
});
test('Registros de autoridad vencidos suspenden lectura verificada de instituciones conocidas',async()=>{
 const a=runtime(ids[0]),school=await institution(a,ids[1],'Química aplicada',1);
 await a.local.importFeed(school.feed,async()=>true);
 const owner=await a.core.createIdentity();
 await a.registry.install(await authority(a,owner,[{school}]),async()=>true);
 assert.equal((await a.local.searchVerified('')).length,1);
 a.advanceDays(16);
 assert.equal((await a.local.searchVerified('')).length,0);
 assert.equal(a.requested().length,0);
});
test('Modificación de una ficha firmada en localStorage bloquea búsqueda, sin hacer solicitudes',async()=>{
 const a=runtime(ids[0]),school=await institution(a,ids[1],'Energía verde',1);
 await a.local.importFeed(school.feed,async()=>true);
 assert.equal((await a.local.searchVerified('')).length,1);
 const key=[...a.storage.keys()].find(k=>k.includes('verified-feeds-v2:'));
 assert.ok(key);
 const body=JSON.parse(a.storage.get(key));
 body[ids[1]].records[0].title='Texto falsificado';
 a.storage.set(key,JSON.stringify(body));
 await assert.rejects(a.local.searchVerified(''),/Firma digital incorrecta/);
 assert.equal(a.requested().length,0);
});
test('Una caché antigua global de metadatos sin firma retenida no se presenta como verificada',async()=>{
 const storage=new Map(),a=runtime(ids[0],storage),school=await institution(a,ids[1],'Átomos de carbono',1);
 storage.set('nexus-mesh:catalogue:'+a.local.scope,JSON.stringify([school.rec]));
 storage.set('nexus-mesh:pins:'+a.local.scope,JSON.stringify({[ids[1]]:'huella-legacy'}));
 assert.equal((await a.local.searchVerified('')).length,0);
 assert.equal(a.local.external().length,0);
});
test('El servidor no puede omitir retiros firmados ni resucitar fichas retiradas',async()=>{
 const a=runtime(ids[0]),school=await institution(a,ids[1],'Guía de laboratorio',1);
 await a.local.importFeed(school.feed,async()=>true);
 const withdrawn=a.core.withdrawn(school.rec);
 await a.local.importFeed(await a.core.signFeed(ids[1],[withdrawn],school.signing),async()=>true);
 assert.equal((await a.local.searchVerified('')).length,0);
 await assert.rejects(a.local.importFeed(school.feed,async()=>true),/retroceder revisiones/);
 const newer=a.core.newRecord({title:'Recurso reciclado',summary:'Material de reemplazo.',
  subject:'quimica',level:'tecnica',license:'CC-BY-4.0',attribution:'Docentes',
  accessUrl:'https://publico.example.ar/otra.pdf',keywords:'laboratorio'},
  ids[1],'Escuela B',docs[1],3);
 await assert.rejects(a.local.importFeed(await a.core.signFeed(ids[1],[newer],school.signing),async()=>true),
  /reactivar un ID/);
 assert.equal(a.local.external()[0].status,'withdrawn');
});
test('La ausencia de un recurso en un snapshot nuevo no lo elimina silenciosamente',async()=>{
 const a=runtime(ids[0]),school=await institution(a,ids[1],'Material de biología',1);
 await a.local.importFeed(school.feed,async()=>true);
 const incomplete=await a.core.signFeed(ids[1],[],school.signing);
 await assert.rejects(a.local.importFeed(incomplete,async()=>true),/incompleto/i);
 assert.equal((await a.local.searchVerified('')).length,1);
});
test('El registro institucional corrupto falla cerrado y no habilita vínculos externos',async()=>{
 const a=runtime(ids[0]),school=await institution(a,ids[1],'Estructuras químicas',1);
 await a.local.importFeed(school.feed,async()=>true);
 const owner=await a.core.createIdentity();
 await a.registry.install(await authority(a,owner,[{school}]),async()=>true);
 const registryKey=[...a.storage.keys()].find(k=>k.includes('trusted-authority:'));
 assert.ok(registryKey);a.storage.set(registryKey,'{"registry":"corrupto"}');
 await assert.rejects(a.local.searchVerified(''),/dañado/);
});
test('La UI siempre espera la verificación de catálogos antes de mostrar enlaces externos',()=>{
 const ui=srcFile('mesh/ui.js');
 assert.ok(ui.includes('await mesh.searchVerified(query'));
 assert.ok(ui.includes('Solo se muestran fichas propias'));
 assert.ok(!/const matches=mesh\.search\(/.test(ui));
});

test('Dos importaciones simultáneas en una pestaña preservan ambos catálogos firmados',async()=>{
 const a=runtime(ids[0]),b=await institution(a,ids[1],'Geometría de moléculas',1),
  c=await institution(a,ids[2],'Observación microscópica',2);
 const delay=async()=>{await Promise.resolve();return true;};
 await Promise.all([a.local.importFeed(b.feed,delay),a.local.importFeed(c.feed,delay)]);
 const records=await a.local.searchVerified('');
 assert.deepEqual(new Set(records.map(x=>x.publisherId)),new Set([ids[1],ids[2]]));
 assert.equal(a.local.external().length,2);
});
test('Error de firma en importación no bloquea las siguientes publicaciones legítimas',async()=>{
 const a=runtime(ids[0]),b=await institution(a,ids[1],'Material biológico',1),
  c=await institution(a,ids[2],'Material químico',2);
 const broken={...b.feed,records:[{...b.rec,title:'Falsificado'}]};
 const failed=a.local.importFeed(broken,async()=>true);
 const valid=a.local.importFeed(c.feed,async()=>true);
 await assert.rejects(failed,/Firma digital incorrecta/);
 assert.equal((await valid).accepted,1);
 assert.equal((await a.local.searchVerified('')).length,1);
});
test('Web Locks garantiza exclusión mutua entre dos pestañas del mismo espacio escolar',async()=>{
 const shared=new Map(),a=runtime(ids[0],shared),another=runtime(ids[0],shared);
 const b=await institution(a,ids[1],'Aprendizaje químico',1);
 const c=await institution(a,ids[2],'Electrónica educativa',2);
 const queues=new Map();let active=0,maxActive=0,calls=0;
 const locks={request(key,options,callback){
  assert.equal(options.mode,'exclusive');
  const before=queues.get(key)||Promise.resolve();
  const run=before.then(async()=>{
   active++;maxActive=Math.max(active,maxActive);calls++;
   try{await Promise.resolve();return await callback();}
   finally{active--;}
  });
  queues.set(key,run.catch(()=>{}));
  return run;
 }};
 a.root.navigator.locks=locks;another.root.navigator.locks=locks;
 await Promise.all([a.local.importFeed(b.feed,async()=>true),
  another.local.importFeed(c.feed,async()=>true)]);
 assert.equal(calls,2);assert.equal(maxActive,1);
 const results=await another.local.searchVerified('');
 assert.deepEqual(new Set(results.map(x=>x.publisherId)),new Set([ids[1],ids[2]]));
});
