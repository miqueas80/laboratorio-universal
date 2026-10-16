import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const gatewayDeclaration=app.split('\n').find(line=>line.startsWith('const XKIRO_GATEWAY_ORIGIN='));
const start=app.indexOf('async function fetchTimeout(');
const end=app.indexOf('async function searchWebSources(',start);
assert.ok(gatewayDeclaration&&start>=0&&end>start,'Gateway contract not found in production app');
const fetchSource=app.slice(start,end);

function harness({gateway='',web=false,status=200,online=true}={}){
 const requests=[],externalRequests=new Set(),xkiroAvailability=new Map();
 const sandbox={
  URL,AbortController,Date,Response,Promise,JSON,setTimeout,clearTimeout,
  XKIRO_API:gateway,WEB_TIMEOUT:3000,
  location:{href:'https://school.test/laboratorio-universal/',origin:'https://school.test'},
  navigator:{onLine:online},state:{web},
  xkiroRetryAt:0,xkiroAvailability,externalRequests,
  retryDelay:()=>60000,
  fetch:async (url,options)=>{requests.push({url,signal:options.signal});return new Response(
   status===200?JSON.stringify({records:[]}):'unavailable',
   {status,headers:{'Content-Type':'application/json','Retry-After':'60'}}
  );}
 };
 const context=vm.createContext(sandbox);
 vm.runInContext(gatewayDeclaration+'\n'+fetchSource+'\nthis.fetchTimeout=fetchTimeout;',context);
 return {context,requests,externalRequests,fetchTimeout:(...args)=>context.fetchTimeout(...args)};
}

test('Universal: empty optional xKiro gateway cannot block local inventory bootstrap',async()=>{
 const h=harness();
 const response=await h.fetchTimeout('inventory.json',{cache:'no-store'},8000);
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{records:[]});
 assert.equal(h.requests.length,1);
 assert.equal(h.requests[0].url,'inventory.json');
 assert.equal(h.externalRequests.size,0);
});

test('Universal: empty gateway cannot block other same-origin local resources',async()=>{
 const h=harness();
 await h.fetchTimeout('./documents-manifest.json');
 await h.fetchTimeout('catalogo_maestro.json');
 assert.equal(h.requests.length,2);
 assert.equal(h.externalRequests.size,0);
});

test('Universal: invalid optional gateway URL safely falls back to local-only behavior',async()=>{
 const h=harness({gateway:'not-a-valid-absolute-url'});
 const response=await h.fetchTimeout('inventory.json');
 assert.equal(response.status,200);
 assert.equal(h.requests.length,1);
});

test('Universal: external resources remain blocked while internet mode is off',async()=>{
 const h=harness({gateway:'',web:false});
 await assert.rejects(h.fetchTimeout('https://example.net/private'),/Internet desactivado/);
 assert.equal(h.requests.length,0);
});

test('Universal: configured gateway retains HTTP429 cooldown without impacting the local path',async()=>{
 const h=harness({gateway:'https://gateway.test',web:true,status:429});
 const response=await h.fetchTimeout('https://gateway.test/agent',{method:'POST',body:'{"model":"mock"}'});
 assert.equal(response.status,429);
 assert.equal(h.requests.length,1);
 assert.ok(h.context.xkiroRetryAt>Date.now());
 assert.equal(h.externalRequests.size,0,'external controllers must be cleaned up');
});
