import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';
const script=p=>readFileSync(resolve(process.cwd(),p),'utf8');
const workspaceCode=script('workspace.js'),archiveCode=script('workspace-archive.js');
function context(store=new Map(),p='/laboratorio-universal/',override={}){
 let reloaded=false;const location={href:'https://example.org'+p,pathname:p,reload:()=>{reloaded=true;}};
 const localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
 const x={location,URL,localStorage,crypto:{randomUUID:()=>override.uuid||'11111111-2222-4333-8444-555555555555'},confirm:()=>true};
 x.globalThis=x;
 vm.runInNewContext(workspaceCode,x);
 return {api:x.NexusWorkspaces,store,wasReloaded:()=>reloaded};
}
function archive(){const x={};x.globalThis=x;vm.runInNewContext(archiveCode,x);return x.NexusWorkspaceArchive;}
const item=(id,name)=>({id,name,formula:''});
test('El espacio inicial conserva las claves heredadas',()=>{
 const ctx=context();assert.equal(ctx.api.activeId,'personal');
 assert.equal(ctx.api.prefix(),'nexus-x-institutional:%2Flaboratorio-universal%2F:');
 assert.equal(ctx.api.databaseSuffix(),'');
});
test('Crear escuela no cambia el estado abierto sin recarga, y guarda un id seguro',()=>{
 const t=context();const id=t.api.create('Escuela Técnica');
 assert.equal(id,'ws-11111111-2222-4333-8444-555555555555');
 assert.equal(t.api.activeId,'personal');assert.equal(t.api.list().length,2);
 assert.equal(t.api.switchTo(id),true);assert.equal(t.wasReloaded(),true);
 const refreshed=context(t.store);assert.equal(refreshed.api.activeId,id);
 assert.ok(refreshed.api.prefix().includes('w:'+id+':'));
 assert.equal(refreshed.api.databaseSuffix(),'_WS_'+id);
 assert.notEqual(refreshed.api.prefix(),t.api.prefix());
});
test('El namespace separa distintas rutas de publicación',()=>{
 assert.notEqual(context(new Map(),'/escuelaA/').api.prefix(),context(new Map(),'/escuelaB/').api.prefix());
});
test('Unirse a una escuela solo registra su código local, no autoriza datos ni Drive',()=>{
 const t=context();assert.throws(()=>t.api.join('escuela-test','Escuela'),/identificador/i);
 const id='ws-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
 assert.equal(t.api.join(id,'Colegio Comunitario'),id);
 assert.equal(t.api.list().length,2);
 assert.equal(t.api.list()[1].name,'Colegio Comunitario');
 assert.equal(t.api.activeId,'personal');
});
test('El merge conserva la versión local si hay colisión distinta',()=>{
 const a=archive();
 const local=[item('NEXUS-X-0001','Reactivo A')],remote=[item('NEXUS-X-0001','Reactivo modificado'),item('NEXUS-X-0002','Reactivo nuevo')];
 const out=a.mergeInventory(local,remote);
 assert.equal(out.added,1);assert.equal(out.conflicts.length,1);
 assert.equal(out.conflicts[0],'NEXUS-X-0001');
 assert.equal(out.records[0].name,'Reactivo A');
 assert.equal(out.records[1].name,'Reactivo nuevo');
 assert.equal(local.length,1);
});
test('El calendario une eventos sin duplicar',()=>{
 const a=archive();const event={date:'2026-10-20',text:'Revisión de inventario'};
 const r=a.mergeCalendar([event],[event,{date:'2026-10-21',text:'Práctica'}]);
 assert.equal(r.added,1);assert.equal(r.events.length,2);
});
test('Los respaldos de otras escuelas se validan por ID y los documentos por ruta',()=>{
 const a=archive();
 const m={schema:1,workspace:{id:'ws-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',name:'Escuela'},inventory:[],calendar:[],documents:[]};
 assert.equal(a.validSnapshot(m),m);
 assert.throws(()=>a.validSnapshot({...m,workspace:{id:'another',name:'Escuela'}}),/ID de institución/);
 assert.throws(()=>a.validSnapshot({...m,documents:[{path:'../secret.pdf',name:'m.pdf',size:20}]}),/Estructura documental/);
 assert.throws(()=>a.validSnapshot({...m,inventory:[item('bad','Nombre')]}),/Código o nombre/);
});
test('La interfaz integra los tres almacenes y protege producción',()=>{
 const app=script('app.js'),core=script('offline/core.js'),html=script('index.html'),sw=script('sw.js');
 for(const x of ['prefix()','databaseSuffix()','bindWorkspaceControls()'])assert.ok(app.includes(x),'Falta '+x);
 assert.ok(core.includes('databaseSuffix()'));assert.ok(html.includes('id="workspacePicker"'));
 for(const f of ['./workspace.js','./workspace-archive.js'])assert.ok(sw.includes(f));
 assert.ok(html.indexOf('src="workspace.js"')<html.indexOf('src="offline/core.js"'));
 assert.ok(html.indexOf('src="workspace-archive.js"')<html.indexOf('src="app.js"'));
});
