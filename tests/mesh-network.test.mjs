import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {webcrypto} from 'node:crypto';
const source=p=>readFileSync(resolve(process.cwd(),p),'utf8');
const coreJS=source('mesh/core.js'),localJS=source('mesh/local.js'),netJS=source('mesh/network.js');
const A='ws-11111111-2222-4333-8444-555555555555',B='ws-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ID='doc-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
function runtime(){
 const storage=new Map(),requests=[];
 let networkCalls=0;
 let response=null;
 const x={crypto:webcrypto,URL,TextEncoder,btoa,atob,Blob,AbortController,setTimeout,clearTimeout,
  location:{href:'https://escuela.example/laboratorio-universal/'},navigator:{onLine:true},
  NexusWorkspaces:{activeId:A,active:()=>({id:A,name:'Escuela A'})},
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},
  fetch:async(url,opts)=>{networkCalls++;requests.push({url,opts});if(!response)throw Error('No response mocked');return response;}};
 x.globalThis=x;
 vm.runInNewContext(coreJS,x);vm.runInNewContext(localJS,x);vm.runInNewContext(netJS,x);
 const setResponse=(obj,{status=200,contentType='application/json',declared=0}={})=>{
  const body=new Blob([JSON.stringify(obj)],{type:contentType});
  response={ok:status===200,status,headers:{get:k=>k==='content-type'?contentType:k==='content-length'?String(declared):null},blob:async()=>body};
 };
 return {x,core:x.NexusMeshCore,local:x.NexusMeshLocal,net:x.NexusMeshNetwork,
  setResponse,requests,networkCalls:()=>networkCalls};
}
async function feed(rt){
 const id=await rt.core.createIdentity();
 const item=rt.core.newRecord({title:'Guía de biología',summary:'Materiales para experimentar y aprender en el aula.',
 subject:'biologia',level:'secundaria',license:'CC-BY-4.0',attribution:'Equipo docente escolar',
 accessUrl:'https://escuela.example/material.pdf',keywords:'célula, biología'},B,'Escuela B',ID);
 return rt.core.signFeed(B,[item],id);
}
test('No consulta la red al inicializarse',()=>{
 const r=runtime();assert.equal(r.networkCalls(),0);assert.equal(r.net.sources().length,0);
});
test('No acepta URLs con tokens, HTTP, hosts de red local ni credenciales',()=>{
 const {net}=runtime();
 const urls=['http://school.edu.ar/mesh.json','https://localhost/x.json','https://192.168.1.5/s.json',
 'https://10.2.0.4/c.json','https://school.edu.ar/s.json?token=abc','https://school.edu.ar/s.json#key',
 'https://u:password@school.edu.ar/s.json','https://school.edu.ar/index.html'];
 for(const url of urls)assert.throws(()=>net.canonicalUrl(url),/HTTPS|URL|privado|catálogo/i,url);
 assert.equal(net.canonicalUrl('https://escuela.edu.ar/nexus-mesh.json'),'https://escuela.edu.ar/nexus-mesh.json');
});
test('Consulta HTTPS bajo acción del docente sin credenciales y guarda firma válida',async()=>{
 const r=runtime();r.setResponse(await feed(r));
 let accepted=0;
 const result=await r.net.fetchCatalogue('https://escuela.edu.ar/nexus-mesh.json',async()=>{accepted++;return true;});
 assert.equal(result.accepted,1);assert.equal(accepted,1);
 assert.equal(r.networkCalls(),1);assert.equal(r.net.sources().length,1);
 const opts=r.requests[0].opts;
 assert.equal(opts.credentials,'omit');assert.equal(opts.redirect,'error');assert.equal(opts.referrerPolicy,'no-referrer');
 assert.equal(opts.method,'GET');assert.equal(opts.cache,'no-store');
 assert.equal(r.local.search('biología').length,1);
 r.x.navigator.onLine=false;
 await assert.rejects(r.net.fetchCatalogue('https://escuela.edu.ar/nexus-mesh.json',async()=>true),/Sin conexión/);
 assert.equal(r.local.search('biología').length,1);
});
test('No permite alterar metadatos ni borrar el catálogo ya verificado',async()=>{
 const r=runtime(),signed=await feed(r);
 r.setResponse(signed);
 await r.net.fetchCatalogue('https://escuela.edu.ar/nexus-mesh.json',async()=>true);
 r.setResponse({...signed,records:[{...signed.records[0],title:'Falsificado'}]});
 await assert.rejects(r.net.fetchCatalogue('https://escuela.edu.ar/nexus-mesh.json',async()=>true),/Firma digital/);
 assert.equal(r.local.search('Guía')[0].title,'Guía de biología');
});
test('Falla de CORS/red y Content-Type incorrecto no publican nada',async()=>{
 const r=runtime();r.setResponse(await feed(r),{contentType:'text/html'});
 await assert.rejects(r.net.fetchCatalogue('https://escuela.edu.ar/nexus-mesh.json',async()=>true),/catálogo JSON/);
 assert.equal(r.local.external().length,0);
});
test('Cambio de host de una escuela previamente fijada se rechaza',async()=>{
 const r=runtime();r.setResponse(await feed(r));
 await r.net.fetchCatalogue('https://escuela.edu.ar/nexus-mesh.json',async()=>true);
 await assert.rejects(r.net.fetchCatalogue('https://otro-dominio.edu.ar/nexus-mesh.json',async()=>true),/cambió la URL/);
 assert.equal(r.net.sources().length,1);
});
test('Precache y UI de conexión HTTPS siguen siendo explícitos y offline-first',()=>{
 const html=source('index.html'),sw=source('sw.js'),ui=source('mesh/ui.js');
 assert.ok(html.includes('id="meshFetchBtn"')&&html.includes('id="meshRefreshBtn"'));
 assert.ok(html.includes('src="mesh/network.js"'));
 assert.ok(sw.includes("'./mesh/network.js'"));
 assert.ok(ui.includes("network.fetchCatalogue("));
});
