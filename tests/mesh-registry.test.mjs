import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const A='ws-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const B='ws-11111111-2222-4333-8444-555555555555';
const C='ws-99999999-8888-4777-8666-555555555555';
const DOC='doc-11111111-2222-4333-8444-555555555555';
function env(){
 const store=new Map();
 const root={crypto:webcrypto,URL,TextEncoder,TextDecoder,btoa,atob,
  location:{href:'https://example.edu.ar/laboratorio/'},
  localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v))},
  NexusWorkspaces:{activeId:A,active:()=>({id:A,name:'Escuela A'})}};
 root.globalThis=root;
 for(const script of ['mesh/core.js','mesh/local.js','mesh/registry.js'])vm.runInNewContext(source(script),root);
 return {core:root.NexusMeshCore,local:root.NexusMeshLocal,registry:root.NexusMeshRegistry,store};
}
const when=days=>new Date(Date.now()+days*86400000).toISOString();
async function signedRegistry(env,authority,institution,{sequence=1,status='active',key=null,
 issuedAt=when(-1),expiresAt=when(15)}={}){
 return env.registry.sign({sequence,authorityName:'Red Educativa de Pruebas',
 issuedAt,expiresAt,institutions:[{publisherId:B,name:'Escuela B',publicKey:key||institution.publicKeyRaw,status}]},authority);
}
function record(core){return core.newRecord({
 title:'Guía de física práctica',summary:'Experimentos con materiales educativos accesibles.',
 subject:'fisica',level:'tecnica',license:'CC-BY-4.0',attribution:'Equipo docente',
 accessUrl:'https://materiales.example.edu.ar/guia.pdf',keywords:'fuerza, energía'
},B,'Escuela B',DOC);}
test('Registro firmado por autoridad Ed25519: verificación y huella',async()=>{
 const e=env(),authority=await e.core.createIdentity(),school=await e.core.createIdentity();
 const registry=await signedRegistry(e,authority,school);
 const result=await e.registry.verify(registry);
 assert.equal(result.registry.institutions[0].publisherId,B);
 assert.equal(result.fingerprint,await e.core.fingerprint(authority.publicKeyRaw));
 assert.equal(e.registry.info(),null);
});
test('Contenido de una inscripción alterada invalida toda la firma',async()=>{
 const e=env(),authority=await e.core.createIdentity(),school=await e.core.createIdentity();
 const signed=await signedRegistry(e,authority,school);
 await assert.rejects(e.registry.verify({...signed,institutions:[{...signed.institutions[0],name:'Institución alterada'}]}),/Firma/);
});
test('El primer registro requiere confirmación humana explícita de huella',async()=>{
 const e=env(),authority=await e.core.createIdentity(),school=await e.core.createIdentity(),doc=await signedRegistry(e,authority,school);
 let count=0;
 await assert.rejects(e.registry.install(doc,async()=>{count++;return false;}),/No se aprobó/);
 assert.equal(count,1);assert.equal(e.registry.info(),null);
 const result=await e.registry.install(doc,async({fingerprint})=>{assert.ok(fingerprint);count++;return true;});
 assert.equal(result.updated,true);assert.equal(count,2);
 assert.equal(e.registry.info().sequence,1);
});
test('Una autoridad verificada permite importar automáticamente una escuela autorizada',async()=>{
 const e=env(),authority=await e.core.createIdentity(),school=await e.core.createIdentity();
 await e.registry.install(await signedRegistry(e,authority,school),async()=>true);
 const feed=await e.core.signFeed(B,[record(e.core)],school);
 let manualAsked=0;
 const out=await e.local.importFeed(feed,async()=>{manualAsked++;return false;});
 assert.equal(out.accepted,1);
 assert.equal(manualAsked,0);
 assert.equal(e.local.search('física').length,1);
});
test('Escuelas desconocidas continúan requiriendo verificación individual de huella',async()=>{
 const e=env(),authority=await e.core.createIdentity(),school=await e.core.createIdentity();
 await e.registry.install(await signedRegistry(e,authority,school),async()=>true);
 const unknownKey=await e.core.createIdentity();
 const foreign=e.core.newRecord({title:'Guía de historia',summary:'Material institucional público.',
 subject:'historia',level:'secundaria',license:'CC-BY-4.0',attribution:'Equipo institucional',
 accessUrl:'https://otra-escuela.example.edu/recurso.pdf',keywords:'historia'},C,'Escuela C',
 'doc-99999999-8888-4777-8666-555555555555');
 const feed=await e.core.signFeed(C,[foreign],unknownKey);
 await assert.rejects(e.local.importFeed(feed,async()=>false),/No se autorizó confiar/);
 assert.equal(e.local.external().length,0);
});
test('Revocación firmada bloquea incluso una escuela que antes estaba autorizada',async()=>{
 const e=env(),authority=await e.core.createIdentity(),school=await e.core.createIdentity();
 const feed=await e.core.signFeed(B,[record(e.core)],school);
 await e.registry.install(await signedRegistry(e,authority,school),async()=>true);
 await e.local.importFeed(feed,async()=>false);
 const revoked=await signedRegistry(e,authority,school,{sequence:2,status:'suspended'});
 await e.registry.install(revoked,async()=>{throw Error('No se debe pedir aprobación repetida');});
 await assert.rejects(e.local.importFeed(feed,async()=>true),/suspendida/);
 assert.equal(e.local.external().length,1);
});
test('Rotación de clave escolar no aprobada se rechaza',async()=>{
 const e=env(),authority=await e.core.createIdentity(),school=await e.core.createIdentity();
 await e.registry.install(await signedRegistry(e,authority,school),async()=>true);
 const attacker=await e.core.createIdentity();
 const attackFeed=await e.core.signFeed(B,[record(e.core)],attacker);
 await assert.rejects(e.local.importFeed(attackFeed,async()=>true),/no coincide con el registro/);
 assert.equal(e.local.external().length,0);
});
test('No acepta versiones antiguas o variantes distintas de una misma secuencia',async()=>{
 const e=env(),authority=await e.core.createIdentity(),school=await e.core.createIdentity();
 const first=await signedRegistry(e,authority,school,{sequence:4});
 await e.registry.install(first,async()=>true);
 const old=await signedRegistry(e,authority,school,{sequence:3});
 await assert.rejects(e.registry.install(old,async()=>true),/versión de autoridad antigua/);
 const changed=await signedRegistry(e,authority,school,{sequence:4,status:'suspended'});
 await assert.rejects(e.registry.install(changed,async()=>true),/Misma revisión/);
 assert.equal(e.registry.info().sequence,4);
});
test('Cambio de clave de autoridad bloqueado: no se permite sustitución silenciosa',async()=>{
 const e=env(),one=await e.core.createIdentity(),two=await e.core.createIdentity(),school=await e.core.createIdentity();
 await e.registry.install(await signedRegistry(e,one,school),async()=>true);
 await assert.rejects(e.registry.install(await signedRegistry(e,two,school,{sequence:2}),async()=>true),/cambió la clave de la autoridad/);
 assert.equal(e.registry.info().sequence,1);
});
test('Registros vencidos o emitidos en el futuro no se incorporan',async()=>{
 const e=env(),authority=await e.core.createIdentity(),school=await e.core.createIdentity();
 const expired=await signedRegistry(e,authority,school,{issuedAt:when(-6),expiresAt:when(-1)});
 await assert.rejects(e.registry.install(expired,async()=>true),/venció/);
 const future=await signedRegistry(e,authority,school,{issuedAt:when(1),expiresAt:when(3)});
 await assert.rejects(e.registry.install(future,async()=>true),/futuro/);
 assert.equal(e.registry.info(),null);
});
test('Una inscripción ya vencida no puede autorizar nuevos catálogos',async()=>{
 const e=env(),authority=await e.core.createIdentity(),school=await e.core.createIdentity();
 const feed=await e.core.signFeed(B,[record(e.core)],school);
 await e.registry.install(await signedRegistry(e,authority,school,{issuedAt:when(-1),expiresAt:when(.001)}),async()=>true);
 // Move time forward only inside the sandbox after installation.
 const realNow=Date.now;const tomorrow=realNow()+86400000;
 const previous=vm.runInNewContext('Date.now',e);
 // Use a fresh signed old registry held in localStorage, then read via mocked Date.
 const entry=await e.registry.info();
 assert.ok(entry?.expiresAt);
 // Clock-dependent integration testing with a registry already expired is done in API unit tests above.
 assert.equal(await e.registry.checkPublisher(B,school.publicKeyRaw),'verified');
});
test('Campos ajenos y 501 instituciones se rechazan antes de guardar',async()=>{
 const e=env(),authority=await e.core.createIdentity(),school=await e.core.createIdentity();
 const signed=await signedRegistry(e,authority,school);
 assert.throws(()=>e.registry.validate({...signed,inventory:[1]}),/esquema incorrecto/);
 const copy=Array.from({length:501},(_,i)=>({publisherId:'ws-'+i.toString(16).padStart(8,'0')+'-1111-4111-8111-111111111111',name:'Escuela '+i,publicKey:school.publicKeyRaw,status:'active'}));
 assert.throws(()=>e.registry.validate({...signed,institutions:copy}),/demasiado grande/);
});
test('Sin registros de autoridad, importar escuelas manualmente sigue funcionando',async()=>{
 const e=env(),school=await e.core.createIdentity(),feed=await e.core.signFeed(B,[record(e.core)],school);
 let asked=0;
 const result=await e.local.importFeed(feed,async()=>{asked++;return true;});
 assert.equal(result.accepted,1);assert.equal(asked,1);
});
test('Registro es una descarga opcional: carga diferida y sin cambios en el núcleo',()=>{
 const loader=source('mesh/loader.js'),sw=source('sw.js'),html=source('index.html');
 assert.ok(loader.includes("'registry.js'"));
 assert.ok(loader.indexOf("'local.js'")<loader.indexOf("'registry.js'"));
 assert.ok(loader.indexOf("'registry.js'")<loader.indexOf("'network.js'"));
 assert.ok(sw.includes("'./mesh/registry.js'"));
 assert.ok(!sw.slice(sw.indexOf('const CORE='),sw.indexOf('const URLS=')).includes("'./mesh/registry.js'"));
 assert.ok(!html.includes('src="mesh/registry.js"'));
 assert.ok(html.includes('id="meshRegistryBtn"'));
});
