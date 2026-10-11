/* NEXUS-X 2-device pilot — explicit, signed JSON file transfer.
 * Nothing is sent automatically; no server, XHR, analytics or document upload.
 */
(function(root){
'use strict';
const $=id=>root.document.getElementById(id);
const mesh=root.NexusMeshLocal,core=root.NexusMeshCore,choice=root.NexusPilotRole;
const maxBytes=3*1024*1024;
const subjects={a:'fisica',b:'quimica',c:'biologia'};
const titles={a:'Energía renovable y circuitos eléctricos',b:'Reacciones químicas y cambios de la materia',
 c:'Células y observación microscópica'};
const keywords={a:'energia, electricidad, circuitos',b:'quimica, reacciones, sustancias',
 c:'biologia, celulas, microscopio'};
const wait={import:false,export:false,create:false};
const say=message=>{
 const text=String(message);
 $('status').textContent=text;
 const t=new Date().toLocaleTimeString('es-AR');
 $('events').textContent='['+t+'] '+text+'\n'+($('events').textContent==='Sin eventos.'?'':$('events').textContent).slice(0,4800);
};
const make=(tag,text='',className='')=>{
 const node=root.document.createElement(tag);
 if(text)node.textContent=String(text);
 if(className)node.className=className;
 return node;
};
function drawOwn(){
 const host=$('myRecords');host.replaceChildren();
 const records=mesh.own().slice().reverse();
 if(!records.length){host.append(make('p','Aún no creaste fichas en esta escuela.','muted'));return;}
 for(const record of records){
  const item=make('div','','result');
  item.append(make('strong',record.status==='withdrawn'?'RETIRO FIRMABLE · '+record.id:record.title));
  item.append(make('small',record.status+' · revisión '+record.revision+' · '+record.id));
  host.append(item);
 }
}
async function drawForeign(){
 const host=$('results');host.replaceChildren();
 host.append(make('p','Verificando firmas almacenadas…','muted'));
 const term=$('search').value.trim();
 try{
  const results=await mesh.searchVerified(term,{limit:60});
  host.replaceChildren();
  if(!results.length){host.append(make('p','Todavía no hay fichas externas verificadas para esta búsqueda.','muted'));return;}
  for(const record of results){
   const item=make('div','','result');
   item.append(make('strong',record.title));
   item.append(make('small',record.publisherName+' · '+record.subject+' · '+record.license+
    ' · revisión '+record.revision+' · firma verificada localmente'));
   host.append(item);
  }
 }catch(error){
  host.replaceChildren();
  host.append(make('div','No se muestran catálogos externos: '+error.message,'status'));
  say('Firma o identidad almacenada rechazada: '+error.message);
 }
}
function showImported(){
 const host=$('imported');host.replaceChildren();
 const trust=mesh.pins(),feeds=mesh.external();
 const publishers=[...new Set(feeds.map(r=>r.publisherId))];
 if(!publishers.length){host.append(make('p','No hay catálogos externos cargados en esta escuela.','muted'));return;}
 for(const id of publishers){
  const count=feeds.filter(r=>r.publisherId===id).length;
  const line=make('div','','result');
  line.append(make('strong','Institución '+id));
  line.append(make('small',count+' fichas y avisos almacenados · huella '+(trust[id]||'SIN FIJAR')));
  host.append(line);
 }
}
async function fingerprint(){
 try{
  const keys=await mesh.identity({allowCreate:false});
  const value=await core.fingerprint(keys.publicKeyRaw);
  $('fingerprint').textContent=value;
 }catch(error){
  $('fingerprint').textContent='Sin identidad de firma todavía. Creá una ficha de prueba. ('+error.message+')';
 }
}
async function create(){
 if(wait.create)return;wait.create=true;$('create').disabled=true;
 try{
  if(mesh.activeId==='personal')throw Error('Seleccioná una escuela antes de publicar.');
  // Signing identity is non-extractable and persisted by NexusMeshLocal in IndexedDB.
  // Failing this step aborts creation: never publish an unexportable catalogue.
  await mesh.identity({allowCreate:true});
  const type=choice.current;
  const record=mesh.publish({
   title:titles[type],summary:'Ficha ficticia de intercambio de conocimiento educativo entre dos dispositivos.',
   subject:subjects[type],level:'tecnica',license:'CC-BY-4.0',
   attribution:'Equipo docente ficticio de demostración',
   accessUrl:'https://recursos.example.org/nexus/guia-educativa.pdf',
   keywords:keywords[type]
  },{ownerConfirmed:true,noPersonalDataConfirmed:true});
  await fingerprint();drawOwn();
  say('Ficha ficticia creada en '+choice.ROLES[type].name+' ('+record.id+'). Todavía NO se compartió.');
 }catch(error){say('No se pudo crear una ficha: '+error.message+
  '. Si estás abriendo un HTML local, probá un navegador que admita IndexedDB en archivos.');}
 finally{wait.create=false;$('create').disabled=false;}
}
async function exportFeed(){
 if(wait.export)return;wait.export=true;$('export').disabled=true;
 let url;
 try{
  const feed=await mesh.exportFeed();
  const verified=await core.verifyFeed(feed);
  const body=JSON.stringify(feed,null,2);
  const blob=new Blob([body],{type:'application/json'});
  if(blob.size>maxBytes)throw Error('Límite de 3 MB del piloto excedido.');
  url=URL.createObjectURL(blob);
  const node=make('a');node.href=url;
  node.download='NEXUS-MALLA-'+choice.current.toUpperCase()+'-'+feed.publisherId.slice(-6)+'.json';
  root.document.body.append(node);node.click();node.remove();
  $('fingerprint').textContent=verified.fingerprint;
  say('Catálogo firmado exportado: '+feed.records.length+
   ' fichas y retiros. Compartí el JSON como ARCHIVO y verificá la huella en el otro dispositivo: '+
   verified.fingerprint);
 }catch(error){say('No se pudo exportar: '+error.message);}
 finally{
  if(url)root.setTimeout(()=>URL.revokeObjectURL(url),60000);
  wait.export=false;$('export').disabled=false;
 }
}
async function importFile(file){
 if(wait.import)return;
 if(!file||file.size<=0||file.size>maxBytes)throw Error('Seleccioná un archivo JSON válido de hasta 3 MB.');
 if(!/\.json$/i.test(file.name))throw Error('El archivo firmado debe tener extensión .json.');
 wait.import=true;$('import').disabled=true;
 try{
  const raw=JSON.parse(await file.text());
  // Pre-verification always precedes the user dialogue and persistence.
  const initial=await core.verifyFeed(raw);
  if(initial.feed.publisherId===mesh.activeId)throw Error('No se importa un catálogo de la misma escuela.');
  const result=await mesh.importFeed(raw,async({publisherId,fingerprint,count})=>{
   // TOFU: user must independently verify that this school's public key
   // belongs to the intended sender; a valid signature alone is NOT identity.
   return root.confirm('ESCUELA EXTERNA DESCONOCIDA\n\nID: '+publisherId+
    '\nFichas y retiros: '+count+'\nHUELLA ED25519: '+fingerprint+
    '\n\nCompará esta huella con la que aparece en el teléfono remitente, por otro canal. '+
    'No aceptes si difieren.\n\n¿Confirmaste la huella y querés importar este catálogo?');
  });
  showImported();await drawForeign();
  say('Importación verificada desde '+result.publisherId+': '+result.accepted+
   ' revisiones aceptadas. Huella original: '+initial.fingerprint+
   '. Ya podés buscar offline.');
  return result;
 }finally{wait.import=false;$('import').disabled=false;}
}
async function withdraw(){
 const first=mesh.own().find(r=>r.status==='published');
 if(!first){say('Primero creá una ficha vigente para probar un retiro.');return;}
 if(!root.confirm('¿Marcar como retirada «'+first.title+'»? Después exportá y compartí el nuevo archivo firmado.'))return;
 try{
  const item=mesh.withdraw(first.id);
  drawOwn();
  say('Retiro local registrado, revisión '+item.revision+
   '. Exportá de nuevo y envialo al receptor: la ficha retirada no se mostrará tras la importación.');
 }catch(error){say('Retiro rechazado: '+error.message);}
}
async function copyFingerprint(){
 const value=$('fingerprint').textContent;
 if(!/^[A-Za-z0-9_-]{43}$/.test(value)){
  say('No existe todavía una huella de identidad válida. Creá una ficha primero.');return;
 }
 try{await root.navigator.clipboard.writeText(value);say('Huella copiada. Confirmala por un canal independiente.');}
 catch{say('No se pudo copiar automáticamente. Mantené presionada la huella para copiarla manualmente.');}
}
function boot(){
 if(!core||!mesh||!choice){$('status').textContent='No se pudo cargar la Malla Federal.';return;}
 $('role').value=choice.current||'';
 $('choose').onclick=()=>{
  try{choice.choose($('role').value);}
  catch(error){say('No se pudo cambiar de escuela: '+error.message);}
 };
 if(!choice.current){$('locked').disabled=true;return;}
 $('locked').disabled=false;
 $('roleInfo').textContent='Escuela activa: '+choice.ROLES[choice.current].name+
  ' · ID '+mesh.activeId+'. Todos los catálogos y huellas de otras escuelas se guardan por separado.';
 $('create').onclick=create;
 $('export').onclick=exportFeed;
 $('withdraw').onclick=withdraw;
 $('copyFingerprint').onclick=copyFingerprint;
 $('import').onclick=()=>$('file').click();
 $('file').onchange=async event=>{
  const f=event.target.files?.[0];event.target.value='';
  if(!f)return;
  try{await importFile(f);}catch(error){say('ARCHIVO RECHAZADO: '+error.message);}
 };
 $('find').onclick=drawForeign;
 $('search').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();drawForeign();}});
 drawOwn();showImported();fingerprint();drawForeign();
 say(choice.ROLES[choice.current].name+' lista. No hay solicitudes de red ni sincronización automática.');
}
if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',boot,{once:true});
else boot();
})(globalThis);
