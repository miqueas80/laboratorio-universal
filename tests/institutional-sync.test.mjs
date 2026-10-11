import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ReferenceLedger,validateOperation,assertTrustedPrincipal,PROTOCOL_VERSION,MAX_BATCH} from '../institutional/sync-core.mjs';
const A='ws-11111111-2222-4333-8444-555555555555';
const B='ws-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ACTOR='google:1045209357';
const teacher=(tenantId=A)=>({tenantId,subject:ACTOR,role:'teacher',identityVerified:true,membershipVerified:true});
const viewer=(tenantId=A)=>({...teacher(tenantId),role:'viewer'});
const admin=(tenantId=A)=>({...teacher(tenantId),role:'admin'});
const op=(number,{tenantId=A,entity='inventory',entityId='NEXUS-X-0001',kind='upsert',baseVersion=0,payload={id:'NEXUS-X-0001',name:'Microscopio'}}={})=>({
 v:PROTOCOL_VERSION,tenantId,
 opId:'00000000-0000-4000-8000-'+String(number).padStart(12,'0'),
 actor:ACTOR,entity,entityId,kind,baseVersion,payload
});
test('Validación estricta: modelo versionado y tamaño',()=>{
 assert.equal(validateOperation(op(1)).v,1);
 assert.equal(MAX_BATCH,50);
 assert.throws(()=>validateOperation({...op(1),unknown:1}),/Esquema/);
 assert.throws(()=>validateOperation({...op(1),v:2}),/protocolo/);
 assert.throws(()=>validateOperation({...op(1),payload:{...op(1).payload,secret:'clave'}}),/Campo no permitido/);
 assert.throws(()=>validateOperation({...op(1),entityId:'NEXUS-X-9999',payload:{id:'NEXUS-X-0001',name:'Microscopio'}}),/ID del contenido/);
 assert.throws(()=>validateOperation({...op(1),payload:{id:'NEXUS-X-0001',name:'x'.repeat(5000)}}),/demasiado extenso/);
});
test('Permisos: sesión verificada y membresía son requisitos previos',()=>{
 assert.equal(assertTrustedPrincipal(teacher(),A,'write'),true);
 assert.equal(assertTrustedPrincipal(admin(),A,'write'),true);
 assert.equal(assertTrustedPrincipal(viewer(),A,'read'),true);
 assert.throws(()=>assertTrustedPrincipal({...teacher(),membershipVerified:false},A,'read'),/no verificadas/);
 assert.throws(()=>assertTrustedPrincipal({...teacher(),identityVerified:false},A,'write'),/no verificadas/);
 assert.throws(()=>assertTrustedPrincipal(viewer(),A,'write'),/insuficientes/);
});
test('Separación estricta de escuela en lecturas y escrituras',()=>{
 const ledger=new ReferenceLedger(A);
 assert.throws(()=>ledger.apply(teacher(B),[op(1)]),/entre instituciones/);
 assert.throws(()=>ledger.read(viewer(B),'inventory','NEXUS-X-0001'),/entre instituciones/);
 assert.throws(()=>ledger.changes(viewer(B)),/entre instituciones/);
 assert.throws(()=>ledger.apply(teacher(),[op(1,{tenantId:B})]),/cruzar instituciones/);
 assert.equal(ledger.revision,0);
});
test('El actor de la operación no puede suplantar al usuario verificado',()=>{
 const l=new ReferenceLedger(A);
 assert.throws(()=>l.apply(teacher(),[{...op(1),actor:'google:someone-else'}]),/Emisor no coincide/);
 assert.equal(l.revision,0);
});
test('Inventario: escritura, lectura segura y cursor incremental',()=>{
 const l=new ReferenceLedger(A);
 const result=l.apply(teacher(),[op(1)]);
 assert.deepEqual([result.ok,result.committed,result.revision],[true,1,1]);
 const d=l.read(viewer(),'inventory','NEXUS-X-0001');
 assert.equal(d.payload.name,'Microscopio');assert.equal(d.version,1);
 d.payload.name='ATACANTE';
 assert.equal(l.read(viewer(),'inventory','NEXUS-X-0001').payload.name,'Microscopio');
 const change=l.changes(viewer(),{after:0});
 assert.equal(change.events.length,1);assert.equal(change.cursor,1);
 assert.equal(l.changes(viewer(),{after:1}).events.length,0);
});
test('Reintentos iguales son idempotentes; opId alterado se rechaza',()=>{
 const l=new ReferenceLedger(A);const first=op(1);
 l.apply(teacher(),[first]);
 const same=l.apply(teacher(),[JSON.parse(JSON.stringify(first))]);
 assert.equal(same.committed,0);assert.equal(same.revision,1);
 assert.equal(same.receipts[0].replayed,true);
 const different=l.apply(teacher(),[{...first,payload:{id:'NEXUS-X-0001',name:'Alterado'}}]);
 assert.equal(different.ok,false);assert.equal(different.conflicts[0].reason,'OP_ID_REUSED');assert.equal(l.revision,1);
});
test('Conflictos concurrentes: ninguno se pisa silenciosamente',()=>{
 const l=new ReferenceLedger(A);
 l.apply(teacher(),[op(1)]);
 const update=l.apply(teacher(),[op(2,{baseVersion:1,payload:{id:'NEXUS-X-0001',name:'Equipo actualizado'}})]);
 assert.equal(update.ok,true);
 const stale=l.apply(teacher(),[op(3,{baseVersion:1,payload:{id:'NEXUS-X-0001',name:'Cambio externo'}})]);
 assert.equal(stale.ok,false);assert.equal(stale.conflicts[0].reason,'VERSION_CONFLICT');
 assert.equal(stale.conflicts[0].actual,2);
 assert.equal(l.read(viewer(),'inventory','NEXUS-X-0001').payload.name,'Equipo actualizado');
});
test('Lotes atómicos: un conflicto deja toda la transacción sin modificar',()=>{
 const l=new ReferenceLedger(A);l.apply(teacher(),[op(1)]);
 const result=l.apply(teacher(),[
  op(2,{entityId:'NEXUS-X-0002',payload:{id:'NEXUS-X-0002',name:'Balanza'}}),
  op(3,{baseVersion:0})
 ]);
 assert.equal(result.ok,false);
 assert.equal(l.read(viewer(),'inventory','NEXUS-X-0002'),null);
 assert.equal(l.revision,1);
});
test('Borrado explícito genera lápida con versión monotónica',()=>{
 const l=new ReferenceLedger(A);l.apply(teacher(),[op(1)]);
 const deleted=l.apply(teacher(),[op(2,{kind:'delete',baseVersion:1,payload:null})]);
 assert.equal(deleted.ok,true);assert.equal(l.read(viewer(),'inventory','NEXUS-X-0001').deleted,true);
 assert.equal(l.read(viewer(),'inventory','NEXUS-X-0001').version,2);
 assert.equal(l.read(viewer(),'inventory','NEXUS-X-0001').payload,null);
});
test('Eventos de calendario, lectura paginada y límites de lote',()=>{
 const l=new ReferenceLedger(A);
 const event=op(1,{entity:'calendar',entityId:'event-123456',payload:{id:'event-123456',date:'2026-10-11',text:'Clase de laboratorio'}});
 const inv=op(2,{entityId:'NEXUS-X-0002',payload:{id:'NEXUS-X-0002',name:'Tubo'}});
 assert.equal(l.apply(teacher(),[event,inv]).committed,2);
 const page=l.changes(viewer(),{after:0,limit:1});assert.equal(page.events.length,1);assert.equal(page.cursor,1);assert.equal(page.hasMore,true);
 const second=l.changes(viewer(),{after:1,limit:1});assert.equal(second.events.length,1);assert.equal(second.hasMore,false);
 assert.throws(()=>l.apply(teacher(),Array.from({length:51},(_,i)=>op(i+3))),/Lote inválido/);
});
test('No se permiten propiedades prototipo contaminante',()=>{
 const dangerous=JSON.parse('{"id":"NEXUS-X-0001","name":"OK","__proto__":{"polluted":true}}');
 assert.throws(()=>validateOperation(op(1,{payload:dangerous})),/Campo no permitido|insegura/);
 assert.equal({}.polluted,undefined);
});
test('No almacena documentos en registros de sincronización',()=>{
 const l=new ReferenceLedger(A);
 assert.throws(()=>l.apply(teacher(),[op(1,{entity:'document'})]),/entidad no admitida|Tipo de entidad no admitida/);
 assert.equal(l.revision,0);
});

test('Concurrencia real: dos actores; el segundo recibe conflicto y puede reconciliar explícitamente',()=>{
 const l=new ReferenceLedger(A);
 const OTHER='google:anotherteacher-2';
 const second={...teacher(),subject:OTHER};
 const authored=(base,number,name)=>op(number,{baseVersion:base,payload:{id:'NEXUS-X-0001',name}});
 assert.equal(l.apply(teacher(),[op(1)]).committed,1);
 const a=l.apply(teacher(),[authored(1,2,'Equipo revisado por A')]);
 assert.equal(a.ok,true);
 const stale={...authored(1,3,'Equipo revisado por B'),actor:OTHER};
 const b=l.apply(second,[stale]);
 assert.equal(b.ok,false);assert.equal(b.conflicts[0].actual,2);
 assert.equal(l.read(second,'inventory','NEXUS-X-0001').payload.name,'Equipo revisado por A');
 const resolved={...authored(2,4,'Equipo revisado y conciliado por A y B'),actor:OTHER};
 assert.equal(l.apply(second,[resolved]).ok,true);
 assert.equal(l.read(teacher(),'inventory','NEXUS-X-0001').version,3);
 assert.equal(l.changes(teacher(),{after:1}).events.length,2);
});
test('Revocación de membresía deshabilita lecturas y escrituras, pero no destruye datos',()=>{
 const l=new ReferenceLedger(A);l.apply(teacher(),[op(1)]);
 assert.throws(()=>l.read({...teacher(),membershipVerified:false},'inventory','NEXUS-X-0001'),/no verificadas/);
 assert.throws(()=>l.apply({...teacher(),membershipVerified:false},[op(2,{baseVersion:1})]),/no verificadas/);
 assert.equal(l.revision,1);
});
test('Fechas de calendario imposibles se rechazan (bisiestos incluidos)',()=>{
 const bad=op(1,{entity:'calendar',entityId:'event-123456',payload:{id:'event-123456',date:'2026-02-31',text:'Imposible'}});
 assert.throws(()=>validateOperation(bad),/Fecha de calendario inválida/);
 const leap=op(2,{entity:'calendar',entityId:'event-123456',payload:{id:'event-123456',date:'2028-02-29',text:'Válido'}});
 assert.equal(validateOperation(leap).payload.date,'2028-02-29');
});
test('La capacidad agotada rechaza nuevos eventos sin corrupción',()=>{
 const l=new ReferenceLedger(A,{maxChanges:1});
 l.apply(teacher(),[op(1)]);
 const x=l.apply(teacher(),[op(2,{entityId:'NEXUS-X-0002',payload:{id:'NEXUS-X-0002',name:'Otros'}})]);
 assert.equal(x.ok,false);assert.equal(x.code,'CAPACITY');
 assert.equal(l.read(teacher(),'inventory','NEXUS-X-0002'),null);
 assert.equal(l.revision,1);
});
