/* NEXUS-X Malla Federal — browser-only pilot with synthetic schools.
 * Uses actual NexusMeshCore, NexusMeshLocal and NexusMeshRegistry.
 * Never makes network requests and never reads the school's actual inventory.
 */
(function(root){
'use strict';
const $=id=>document.getElementById(id);
const A='ws-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const B='ws-11111111-2222-4333-8444-555555555555';
const C='ws-99999999-8888-4777-8666-555555555555';
const ids={
 b:['doc-11111111-2222-4333-8444-555555555551','doc-11111111-2222-4333-8444-555555555552'],
 c:['doc-99999999-8888-4777-8666-555555555551','doc-99999999-8888-4777-8666-555555555552']
};
const core=root.NexusMeshCore,local=root.NexusMeshLocal,registry=root.NexusMeshRegistry;
const state={ready:false,authority:null,b:null,c:null,registrySequence:0,offline:false,
 bWithdrawn:false,cSuspended:false,stage:new Set()};
function log(message){
 const date=new Date().toLocaleTimeString('es-AR');
 const el=$('events');
 el.textContent=el.textContent==='Inicialización pendiente.'?'':el.textContent;
 el.textContent='['+date+'] '+message+'\n'+el.textContent;
}
function status(message){$('status').textContent=message;log(message);}
function checkStage(name){
 state.stage.add(name);
 $('testCount').textContent=state.stage.size+' / 7';
}
function enabled(isReady){$('actions').disabled=!isReady;}
function storageOK(){
 const key='nexus-mesh-demo:storage-check';
 root.localStorage.setItem(key,'ok');
 if(root.localStorage.getItem(key)!=='ok')throw Error('Almacenamiento local no disponible');
 root.localStorage.removeItem(key);
}
function makeRecord(publisherId,publisherName,docId,title,subject,keywords){
 return core.newRecord({title,summary:'Ficha didáctica pública y sintética para probar la Malla Federal.',
  subject,level:'tecnica',license:'CC-BY-4.0',attribution:'Equipo docente de demostración',
  accessUrl:'https://recursos.ejemplo.edu.ar/guias/material.pdf',keywords
 },publisherId,publisherName,docId);
}
async function createSchool(id,name,titles,subject,docIds,keywords){
 const identity=await core.createIdentity();
 const entries=titles.map((title,i)=>makeRecord(id,name,docIds[i],title,subject,keywords));
 const feed=await core.signFeed(id,entries,identity);
 return {id,name,identity,entries,feed};
}
function registryUnsigned(version=1,statusC='active'){
 const date=new Date(),later=new Date(date.getTime()+30*86400000);
 return {authorityName:'Autoridad Ficticia de Demostración',
  sequence:version,issuedAt:new Date(date.getTime()-60000).toISOString(),
  expiresAt:later.toISOString(),institutions:[
   {publisherId:B,name:state.b.name,publicKey:state.b.feed.publicKey,status:'active'},
   {publisherId:C,name:state.c.name,publicKey:state.c.feed.publicKey,status:statusC}
  ]};
}
async function prepare(){
 if(state.ready)return status('Las escuelas de prueba ya están preparadas.');
 try{
  if(!root.crypto?.subtle)throw Error('Este navegador no permite firmas Ed25519. Usá Chrome/Edge actualizado y una página local o HTTPS.');
  storageOK();
  $('setupBtn').disabled=true;
  status('Generando identidades criptográficas ficticias de las escuelas B y C...');
  state.b=await createSchool(B,'Escuela B · Demostración',
   ['Átomos, moléculas y enlace químico','Reactivos: prácticas seguras de química'],
   'quimica',ids.b,['atomos','moleculas','laboratorio']);
  state.c=await createSchool(C,'Escuela C · Demostración',
   ['Energía eléctrica y circuitos','Movimiento, fuerza y aceleración'],
   'fisica',ids.c,['energia','electricidad','fisica']);
  state.authority=await core.createIdentity();
  state.ready=true;
  checkStage('prepare');enabled(true);
  $('setupBtn').textContent='Escuelas preparadas';
  $('schoolB').textContent='Catálogo firmado: '+state.b.feed.records.length+' fichas';
  $('schoolC').textContent='Catálogo firmado: '+state.c.feed.records.length+' fichas';
  status('Escuelas listas: se generaron dos catálogos Ed25519 en memoria. Ningún documento se envió a Internet.');
 }catch(error){$('setupBtn').disabled=false;status('No se pudo preparar: '+error.message);}
}
async function trustAuthority(){
 if(!state.ready)return status('Primero prepará las escuelas.');
 try{
  const candidate=await registry.sign(registryUnsigned(1,'active'),state.authority);
  const fp=await core.fingerprint(candidate.publicKey);
  if(!root.confirm('AUTORIDAD DE PRUEBA (NO OFICIAL)\n\nHuella Ed25519:\n'+fp+
   '\n\nEsta autoridad y sus dos escuelas son ficticias. ¿Confiar en este registro para la demostración?')){
   return status('Confirmación cancelada: no se cambió la confianza institucional.');
  }
  const outcome=await registry.install(candidate,async()=>true);
  state.registrySequence=1;
  checkStage('trust');$('authorityBtn').disabled=true;
  status('Registro firmado aceptado, versión '+outcome.sequence+'. Las claves B y C ahora se comprueban contra la autoridad ficticia.');
 }catch(e){status('Autoridad no instalada: '+e.message);}
}
async function importSchool(which){
 const item=state[which],button=which==='b'?'importB':'importC';
 if(!state.ready||!item)return status('Primero prepará las escuelas.');
 $(button).disabled=true;
 try{
  const outcome=await local.importFeed(item.feed,async({publisherId,fingerprint})=>
   root.confirm('Verificación manual de escuela no registrada:\n'+publisherId+'\nHuella: '+fingerprint+'\n¿Autorizar en esta demo?'));
  checkStage(which);
  $('school'+which.toUpperCase()).textContent='Importado y verificado: '+item.feed.records.length+' fichas';
  status('Escuela '+which.toUpperCase()+': '+outcome.accepted+' fichas aceptadas con firma Ed25519. Disponibles para búsqueda offline.');
  await search();
 }catch(e){status('No se importó la escuela '+which.toUpperCase()+': '+e.message);}
 finally{$(button).disabled=false;}
}
async function search(){
 if(!state.ready)return;
 const q=$('query').value.trim(),el=$('results');
 el.replaceChildren();
 try{
  const rows=await local.searchVerified(q,{limit:40});
  if(!rows.length){
   const p=document.createElement('p');p.className='muted';
   p.textContent='Sin coincidencias verificadas para esta búsqueda.';
   el.append(p);
  }
  for(const row of rows){
   if(row.status!=='published')continue;
   const card=document.createElement('div');card.className='result';
   const name=document.createElement('strong');name.textContent=row.title;
   const small=document.createElement('small');
   small.textContent=(row.publisherId===B?'Escuela B':row.publisherId===C?'Escuela C':'Escuela A')+
    ' · '+row.subject+' · '+row.license+' · Ed25519 verificado';
   card.append(name,small);el.append(card);
  }
  $('modeLabel').textContent=state.offline?'Modo avión simulado • búsqueda local':'Modo local • sin tráfico de red';
  if(state.offline)checkStage('offline');
  log('Búsqueda local verificada: '+rows.length+' resultado(s)'+(q?' para «'+q+'»':'')+'.');
 }catch(e){
  const p=document.createElement('p');p.className='status';
  p.textContent='BLOQUEO SEGURO: '+e.message+
   '. No se muestran fichas externas no verificadas. Restablecé la demo para continuar.';
  el.append(p);
  status('Caché rechazada por firma o identidad: '+e.message);
 }
}
async function withdrawB(){
 if(!state.b||!state.stage.has('b'))return status('Importá primero el catálogo B.');
 try{
  const old=state.b.entries[0],withdrawn=core.withdrawn(old);
  const remaining=state.b.entries.slice(1);
  state.b.entries=[withdrawn,...remaining];
  state.b.feed=await core.signFeed(B,state.b.entries,state.b.identity);
  await local.importFeed(state.b.feed,async()=>true);
  state.bWithdrawn=true;checkStage('withdraw');
  $('withdrawB').disabled=true;
  status('Aviso de retiro firmado: «'+old.title+'» desaparece de resultados. La otra ficha de B permanece.');
  await search();
 }catch(e){status('Retiro rechazado: '+e.message);}
}
async function suspendC(){
 if(!state.registrySequence)return status('Primero verificá la autoridad de prueba.');
 if(!state.stage.has('c'))return status('Primero importá el catálogo C.');
 try{
  const candidate=await registry.sign(registryUnsigned(++state.registrySequence,'suspended'),state.authority);
  await registry.install(candidate,async()=>false);
  state.cSuspended=true;checkStage('suspend');
  $('suspendC').disabled=true;
  $('schoolC').textContent='Suspendida por el registro de confianza';
  status('Escuela C suspendida por autoridad firmada. Su caché no desapareció, pero sus materiales dejan de mostrarse.');
  await search();
 }catch(e){status('No se pudo suspender: '+e.message);}
}
function tamper(){
 if(!state.ready)return;
 const key='nexus-mesh:verified-feeds-v2:'+local.scope+':'+A;
 try{
  const old=root.localStorage.getItem(key);
  if(!old)return status('Importá al menos un catálogo antes de alterar su copia.');
  const data=JSON.parse(old),target=Object.keys(data)[0];
  if(!data[target]?.records?.length)return status('No hay fichas que alterar.');
  data[target].records[0].status='published';
  if(!data[target].records[0].title)return status('Elegí un catálogo con ficha publicada.');
  data[target].records[0].title='TÍTULO FALSIFICADO POR UN ATACANTE';
  root.localStorage.setItem(key,JSON.stringify(data));
  status('Se modificó una ficha firmada en la caché de ESTA DEMO. Una búsqueda debería bloquearla.');
  search();
 }catch(e){status('Error al simular ataque: '+e.message);}
}
function reset(){
 if(!root.confirm('¿Restablecer únicamente la caché local de esta demostración? No se toca ningún inventario escolar.'))return;
 const scope=local?.scope||encodeURIComponent(new URL('./',root.location.href).pathname);
 for(const key of [
  'nexus-mesh:verified-feeds-v2:'+scope+':'+A,
  'nexus-mesh:pins-v2:'+scope+':'+A,
  'nexus-mesh:trusted-authority:'+scope+':'+A,
  'nexus-mesh:published:'+scope+':'+A,
  'nexus-mesh:sources-v2:'+scope+':'+A
 ])root.localStorage.removeItem(key);
 root.location.reload();
}
function bind(){
 $('setupBtn').onclick=prepare;
 $('resetBtn').onclick=reset;
 $('authorityBtn').onclick=trustAuthority;
 $('importB').onclick=()=>importSchool('b');
 $('importC').onclick=()=>importSchool('c');
 $('searchBtn').onclick=search;
 $('query').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();search();}});
 $('offlineBtn').onclick=()=>{
  state.offline=!state.offline;
  $('offlineBtn').textContent=state.offline?'Desactivar modo avión simulado':'Activar modo avión simulado';
  status(state.offline?'Modo avión SIMULADO. También podés desactivar realmente Wi-Fi y datos móviles.':
   'Modo avión simulado desactivado. La demo nunca se conecta a un servidor.');
  search();
 };
 $('withdrawB').onclick=withdrawB;
 $('suspendC').onclick=suspendC;
 $('tamperBtn').onclick=tamper;
 log('Laboratorio listo. No se ejecutará ninguna solicitud de red.');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});
else bind();
})(globalThis);
