import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const read=path=>readFileSync(resolve(root,path),'utf8');
test('Demo carga el código real de malla sin módulos escolares ni llamadas a Internet',()=>{
 const html=read('demo/index.html'),js=read('demo/demo.js');
 assert.ok(html.includes('src="../mesh/core.js"'));
 assert.ok(html.includes('src="../mesh/local.js"'));
 assert.ok(html.includes('src="../mesh/registry.js"'));
 assert.ok(!html.includes('src="../app.js"'));
 assert.ok(!html.includes('src="../offline/'));
 assert.ok(!html.includes('src="../mesh/network.js"'));
 assert.ok(!/fetch\s*\(/.test(js));
 assert.ok(!/XMLHttpRequest|sendBeacon|inventory\.json/.test(js));
 assert.ok(js.includes('searchVerified'));
});
test('Demo portable: un único archivo HTML, autónomo y menor que 240 KiB',()=>{
 const file=resolve(root,'dist/MALLA-FEDERAL-DEMO.html');
 if(!existsSync(file))return; // General CI validates source; build CI validates artifact.
 const body=readFileSync(file,'utf8');
 assert.ok(body.includes('root.NexusMeshCore='));
 assert.ok(body.includes('root.NexusMeshLocal='));
 assert.ok(body.includes('root.NexusMeshRegistry='));
 assert.ok(body.includes('async function searchVerified('));
 assert.ok(!/<script\b[^>]*src\s*=/i.test(body));
 assert.ok(!/navigator\.serviceWorker\.register/.test(body));
 assert.ok(body.length<240000);
});
test('Escuelas A/B/C y botones de prueba están presentes sin enlaces al código escolar',()=>{
 const html=read('demo/index.html');
 for(const id of ['setupBtn','authorityBtn','importB','importC','query','searchBtn','offlineBtn','withdrawB','suspendC','tamperBtn','resetBtn'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.ok(html.includes('EXPERIMENTO SIN DOCUMENTOS REALES'));
});
