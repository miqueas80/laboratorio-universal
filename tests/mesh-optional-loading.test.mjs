import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const code=read('mesh/loader.js');
function setup({failAt=null}={}){
 const scripts=[],status={textContent:''};let failedOnce=false;
 const doc={
  currentScript:{src:'https://nexus.example/LaboratorioUniversal/mesh/loader.js'},
  getElementById:id=>id==='meshStatus'?status:null,
  createElement:tag=>{assert.equal(tag,'script');return {dataset:{},async:true};},
  head:{appendChild:script=>{
   scripts.push(script.src);
   queueMicrotask(()=>{
    if(!failedOnce&&failAt&&script.src.endsWith('/'+failAt)){failedOnce=true;script.onerror();}
    else script.onload();
   });
  }}
 };
 const context={URL,Promise,document:doc,location:{href:'https://nexus.example/LaboratorioUniversal/'}};context.globalThis=context;
 vm.runInNewContext(code,context,{filename:'mesh/loader.js'});
 return {scripts,status,loader:context.NexusMeshLoader};
}
test('No se ejecuta la malla ni hace solicitudes en el inicio normal',()=>{
 const {scripts,loader}=setup();assert.deepEqual(scripts,[]);assert.equal(loader.loaded,false);
});
test('Al abrir módulo se descargan archivos en el orden de dependencias',async()=>{
 const {scripts,loader}=setup();
 const ok=await loader.load();
 assert.equal(ok,true);assert.equal(loader.loaded,true);
 assert.deepEqual(scripts.map(url=>url.split('/').at(-1)),[
  'core.js','local.js','registry.js','network.js','federator-client.js','federator-ui.js','ui.js']);
 assert.ok(scripts.every(url=>url.startsWith('https://nexus.example/LaboratorioUniversal/mesh/')));
});
test('Dos clics simultáneos y visitas posteriores no duplican descarga',async()=>{
 const {scripts,loader}=setup();
 const p1=loader.load(),p2=loader.load();
 assert.equal(p1,p2);
 await Promise.all([p1,p2]);
 assert.equal(scripts.length,7);
 await loader.load();
 assert.equal(scripts.length,7);
});
test('Falla en complemento no afecta al núcleo y permite reintentar solo el archivo faltante',async()=>{
 const {scripts,loader,status}=setup({failAt:'network.js'});
 await assert.rejects(loader.load(),/network.js/);
 assert.equal(loader.loaded,false);
 assert.match(status.textContent,/resto de NEXUS sigue funcionando/);
 assert.deepEqual(scripts.map(url=>url.split('/').at(-1)),['core.js','local.js','registry.js','network.js']);
 await loader.load();
 assert.equal(loader.loaded,true);
 assert.deepEqual(scripts.map(url=>url.split('/').at(-1)),[
  'core.js','local.js','registry.js','network.js','network.js','federator-client.js','federator-ui.js','ui.js']);
});
test('No aparecen scripts opcionales en la página ni se instalan con shell offline',()=>{
 const html=read('index.html'),sw=read('sw.js'),app=read('app.js');
 assert.equal((html.match(/src="mesh\/loader\.js"/g)||[]).length,1);
 const optional=['core.js','local.js','registry.js','network.js','federator-client.js','federator-ui.js','ui.js'];
 const core=sw.slice(sw.indexOf('const CORE='),sw.indexOf('const URLS='));
 for(const name of optional){
  assert.ok(!html.includes('<script src="mesh/'+name+'"'),name);
  assert.ok(!core.includes("'./mesh/"+name+"'"),name);
  assert.ok(sw.includes("'./mesh/"+name+"'"),name);
 }
 assert.ok(core.includes("'./mesh/loader.js'"));
 assert.ok(app.includes("if(name==='mesh')globalThis.NexusMeshLoader?.load().catch(()=>{});"));
});
test('Servicio de búsqueda remota no se activa desde el cargador en arranque',()=>{
 const loader=read('mesh/loader.js'),app=read('app.js'),federator=read('mesh/federator-client.js');
 assert.ok(!/fetch\s*\(/.test(loader));
 assert.ok(!loader.includes('NexusMeshFederator.search'));
 assert.ok(!/NexusMeshFederator\?\.search|NexusMeshFederator\.search/.test(app));
 assert.ok(federator.includes('verifyAndImport'));
});
