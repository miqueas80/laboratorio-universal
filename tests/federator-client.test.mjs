import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
const path=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const A='ws-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',B='ws-11111111-2222-4333-8444-555555555555';
const ID='doc-11111111-2222-4333-8444-555555555555';
function setup(){
 let calls=0;const stack=[],db=new Map(),queries=[];
 const x={crypto:webcrypto,URL,TextEncoder,TextDecoder,btoa,atob,Blob,AbortController,setTimeout,clearTimeout,
  location:{href:'https://school.example/nexus/',pathname:'/nexus/'},
  navigator:{onLine:true},NexusWorkspaces:{activeId:A,active:()=>({id:A,name:'Escuela A'})},
  localStorage:{getItem:key=>db.get(key)||null,setItem:(key,value)=>db.set(key,String(value)),removeItem:key=>db.delete(key)},
  fetch:async(uri,options)=>{calls++;queries.push({uri,options});if(!stack.length)throw Error('No mock response');return new Response(JSON.stringify(stack.shift()),{headers:{'content-type':'application/json'}});}};
 x.globalThis=x;
 for(const p of ['mesh/core.js','mesh/local.js','mesh/federator-client.js'])vm.runInNewContext(path(p),x);
 return {api:x.NexusMeshFederator,core:x.NexusMeshCore,local:x.NexusMeshLocal,enqueue:(...values)=>stack.push(...values),
  calls:()=>calls,queries,x};
}
async function published(s){
 const identity=await s.core.createIdentity();
 const item=s.core.newRecord({title:'Guía de energía renovable',summary:'Experiencias y actividades sobre energía.',
  subject:'fisica',level:'tecnica',license:'CC-BY-4.0',attribution:'Docentes institucionales',
  accessUrl:'https://contenidos.ejemplo.edu.ar/energia.pdf',keywords:'electricidad, energía'},B,'Escuela B',ID);
 return {item,feed:await s.core.signFeed(B,[item],identity)};
}
const preview=record=>({schema:1,notice:'discovery_only_verify_signed_catalogue_before_trust',
 hasMore:false,cursor:1,results:[{publisherId:B,catalogUrl:'https://federador.example/api/v1/catalog/'+B,cursor:1,record}]});
test('El federador solo se consulta al tocar Buscar; no hay tráfico de arranque',()=>{
 const s=setup();assert.equal(s.calls(),0);
 assert.equal(typeof s.api.search,'function');
});
test('Origen HTTPS obligatorio, sin credenciales, rutas o parámetros secretos',()=>{
 const {api}=setup();
 for(const url of ['http://federador.example','https://localhost','https://192.168.1.2',
 'https://u:p@federador.example','https://federador.example?a=123','https://federador.example/privado']){
  assert.throws(()=>api.originOf(url),/https|dominio|dirección|origen|federador/i,url);
 }
 assert.equal(api.originOf('https://federador.example'),'https://federador.example');
});
test('La búsqueda permite vista previa sin importar documentos ni credenciales',async()=>{
 const s=setup(),{item}=await published(s);s.enqueue(preview(item));
 const page=await s.api.search('https://federador.example',{q:'energia',subject:'fisica'});
 assert.equal(page.results.length,1);assert.equal(s.local.external().length,0);
 assert.equal(s.queries[0].options.credentials,'omit');
 assert.equal(s.queries[0].options.redirect,'error');
 assert.equal(s.queries[0].options.referrerPolicy,'no-referrer');
 assert.ok(s.queries[0].uri.includes('/api/v1/search'));
});
test('Solo se incorpora ficha idéntica a la contenida en catálogo Ed25519 auténtico',async()=>{
 const s=setup(),{item,feed}=await published(s);s.enqueue(preview(item),feed);
 const page=await s.api.search('https://federador.example',{q:'energia'});
 let asked=0;
 const r=await s.api.verifyAndImport(page.results[0],async ()=>{asked++;return true;});
 assert.equal(asked,1);assert.equal(r.accepted,1);
 assert.equal(s.local.search('energia').length,1);
 s.x.navigator.onLine=false;
 await assert.rejects(s.api.search('https://federador.example',{q:'energia'}),/Sin Internet/);
 assert.equal(s.local.search('energia').length,1);
});
test('Una vista previa falsificada no puede introducir contenido en el catálogo verificado',async()=>{
 const s=setup(),{item,feed}=await published(s);
 const evil={...item,title:'Material falso e intrusivo'};
 s.enqueue(preview(evil),feed);
 const page=await s.api.search('https://federador.example',{q:'energia'});
 let asked=0;
 await assert.rejects(s.api.verifyAndImport(page.results[0],async()=>{asked++;return true;}),/no coincide/i);
 assert.equal(asked,0);assert.equal(s.local.external().length,0);
});
test('Un enlace de catálogo firmado que apunta a otro dominio se rechaza',async()=>{
 const s=setup(),{item}=await published(s);
 s.enqueue({...preview(item),results:[{...preview(item).results[0],catalogUrl:'https://atacante.example/catalog/'+B}]});
 await assert.rejects(s.api.search('https://federador.example',{q:'energia'}),/no coincide/);
 assert.equal(s.local.external().length,0);
});
test('Cursors inconsistentes y esquema remoto diferente son rechazados',async()=>{
 const s=setup(),{item}=await published(s);
 s.enqueue({...preview(item),cursor:999});
 await assert.rejects(s.api.search('https://federador.example',{q:'energia'}),/Cursor inconsistente/);
 s.enqueue({...preview(item),notice:'already_trusted'});
 await assert.rejects(s.api.search('https://federador.example',{q:'energia'}),/verificación obligatoria/);
});
test('La PWA precachea el cliente opcional, pero nunca incorpora el Worker servidor',()=>{
 const sw=path('sw.js'),html=path('index.html');
 assert.ok(sw.includes("'./mesh/federator-client.js'"));
 assert.ok(!html.includes('src="mesh/federator-client.js"'));
 assert.ok(!html.includes('src="mesh/federator-ui.js"'));
 assert.ok(html.includes('src="mesh/loader.js"'));
 assert.ok(!sw.includes("'./federator/worker.mjs'"));
});
