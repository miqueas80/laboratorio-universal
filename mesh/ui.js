/* NEXUS-X Federal Educational Mesh — local interface, no auto network calls. */
(function(root){
'use strict';
function boot(){
 const core=root.NexusMeshCore,mesh=root.NexusMeshLocal;
 const $=id=>document.getElementById(id);
 const status=$('meshStatus'),form=$('meshForm'),own=$('meshOwnList'),results=$('meshResults');
 if(!core||!mesh||!status||!form||!own||!results)return;
 const report=(message)=>{status.textContent=String(message||'');};
 const make=(tag,text='',cls='')=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};
 const school=mesh.activeId==='personal'?null:root.NexusWorkspaces?.active();
 const section=$('meshCurrentSchool');
 if(section)section.textContent=school?'Publicando como: '+school.name:'Para publicar, abrí primero un espacio de escuela.';
 const enable=Boolean(school);
 $('meshPublishBtn').disabled=!enable;
 $('meshExportBtn').disabled=!enable;
 const fill=(select,values)=>{if(!select)return;select.replaceChildren();values.forEach(([value,label])=>{const o=make('option',label);o.value=value;select.append(o);});};
 fill($('meshSubject'),core.SUBJECTS.map(x=>[x,x[0].toUpperCase()+x.slice(1)]));
 fill($('meshLevel'),core.LEVELS.map(x=>[x,x[0].toUpperCase()+x.slice(1)]));
 fill($('meshLicense'),Object.keys(core.LICENSES).map(x=>[x,x]));
 fill($('meshSearchSubject'),[['','Todas las materias'],...core.SUBJECTS.map(x=>[x,x[0].toUpperCase()+x.slice(1)])]);
 function drawOwn(){
  own.replaceChildren();
  const list=mesh.own().slice().reverse();
  if(!list.length){own.append(make('p','Todavía no autorizaste ninguna ficha para esta malla.','muted'));return;}
  const frag=document.createDocumentFragment();
  for(const item of list.slice(0,80)){
   const line=make('div','', 'result-card');
   line.append(make('strong',item.status==='withdrawn'?'Retirado: '+item.id:item.title));
   line.append(make('p',item.status==='withdrawn'?'Aviso de retiro — revisión '+item.revision:item.subject+' · '+item.license+' · revisión '+item.revision,'muted'));
   if(item.status==='published'){
    const b=make('button','Retirar del catálogo','btn');
    b.type='button';b.onclick=()=>{
     if(!confirm('¿Publicar un aviso firmado de retiro de este recurso? Esto no elimina copias que otros ya descargaron ni revoca los derechos de una licencia CC.'))return;
     try{mesh.withdraw(item.id);drawOwn();drawSearch();report('Retiro registrado. Exportá y difundí nuevamente el catálogo firmado para informar a otras escuelas.');}
     catch(e){report(e.message);}
    };line.append(b);
   }
   frag.append(line);
  }
  own.append(frag);
 }
 function drawSearch(){
  const query=String($('meshSearch')?.value||'').trim();
  const subject=$('meshSearchSubject')?.value||'';
  results.replaceChildren();
  const matches=mesh.search(query,{subject,limit:80});
  $('meshResultsCount').textContent=matches.length+' resultado(s) en los catálogos guardados en este dispositivo.';
  if(!matches.length){results.append(make('div','Sin coincidencias. Importá un catálogo firmado de otra escuela o ajustá tu búsqueda.','notice'));return;}
  const frag=document.createDocumentFragment();
  for(const item of matches){
   const card=make('div','', 'result-card');
   card.append(make('strong',item.title));
   card.append(make('p',item.summary,'muted'));
   card.append(make('p',[item.publisherName,item.subject,item.level,item.license,item.attribution].join(' · '),'muted'));
   const link=make('a','Abrir recurso en el sitio de la institución');
   link.href=item.accessUrl;link.target='_blank';link.rel='noopener noreferrer';link.className='btn';
   card.append(link);
   frag.append(card);
  }
  results.append(frag);
 }
 form.onsubmit=async event=>{
  event.preventDefault();
  if(!enable)return report('Primero elegí una escuela.');
  const rights=$('meshRights').checked,privacy=$('meshPrivacy').checked;
  if(!rights||!privacy)return report('Debés confirmar la licencia y ausencia de datos personales.');
  if(!confirm('Vas a autorizar la difusión de una ficha educativa y su enlace, bajo una licencia Creative Commons. Solo se comparte al exportar el catálogo firmado. ¿Continuar?'))return;
  $('meshPublishBtn').disabled=true;
  try{
   // Stable non-exportable signing key generated for this local school only.
   await mesh.identity({allowCreate:true});
   const data={title:$('meshTitle').value,summary:$('meshSummary').value,
    attribution:$('meshAttribution').value,subject:$('meshSubject').value,
    level:$('meshLevel').value,license:$('meshLicense').value,
    accessUrl:$('meshAccessUrl').value,keywords:$('meshKeywords').value};
   const record=mesh.publish(data,{ownerConfirmed:true,noPersonalDataConfirmed:true});
   report('Ficha '+record.id+' guardada localmente. Para compartirla con otras escuelas, exportá el catálogo firmado. No se envió ningún documento.');
   form.reset();drawOwn();drawSearch();
  }catch(e){report('Publicación rechazada: '+e.message);}
  finally{$('meshPublishBtn').disabled=false;}
 };
 $('meshExportBtn').onclick=async()=>{
  if(!enable)return report('No hay escuela seleccionada.');
  $('meshExportBtn').disabled=true;
  try{
   const feed=await mesh.exportFeed();
   const blob=new Blob([JSON.stringify(feed,null,2)],{type:'application/json'});
   const url=URL.createObjectURL(blob),link=make('a');
   link.href=url;link.download='NEXUS-MESH-'+mesh.activeId+'.json';
   document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
   const fp=await core.fingerprint(feed.publicKey);
   report('Catálogo firmado exportado ('+feed.records.length+' fichas y avisos). Huella institucional: '+fp+'. Compartí esta huella por un canal independiente.');
  }catch(e){report('No se pudo exportar: '+e.message);}
  finally{$('meshExportBtn').disabled=false;}
 };
 $('meshImportBtn').onclick=()=>{$('meshFileInput').click();};
 $('meshFileInput').onchange=async e=>{
  const file=e.target.files?.[0];e.target.value='';
  if(!file)return;
  if(file.size<=0||file.size>3*1024*1024)return report('El catálogo supera el límite de 3 MB o está vacío.');
  $('meshImportBtn').disabled=true;
  try{
   const json=JSON.parse(await file.text());
   const result=await mesh.importFeed(json,async ({publisherId,fingerprint,count})=>
    confirm('PRIMER CONTACTO CON ESCUELA EXTERNA\n\nID: '+publisherId+'\nFichas: '+count+
     '\nHuella digital Ed25519:\n'+fingerprint+
     '\n\nCONFIRMÁ ESTA HUELLA CON LA INSTITUCIÓN POR OTRO CANAL. El código de escuela por sí solo no garantiza identidad.\n\n¿Confiar en esta clave para futuros catálogos?'));
   drawSearch();
   report('Firma válida · '+result.accepted+' fichas actualizadas, '+result.stale+' antiguas ignoradas. Huella: '+result.fingerprint+'. Los datos privados locales permanecen separados.');
  }catch(err){report('Catálogo rechazado: '+err.message);}
  finally{$('meshImportBtn').disabled=false;}
 };

 const network=root.NexusMeshNetwork;
 const approveSchool=async ({publisherId,fingerprint,count})=>
  confirm('PRIMER CONTACTO CON ESCUELA EXTERNA\n\nID: '+publisherId+'\nFichas: '+count+
     '\nHuella digital:\n'+fingerprint+
     '\n\nVerificá esta huella con esa institución por un canal independiente. ¿Aceptar esta clave?');
 $('meshFetchBtn').onclick=async()=>{
  if(!network)return report('Transporte federado no disponible.');
  $('meshFetchBtn').disabled=true;
  try{report('Consultando catálogo institucional HTTPS...');
   const data=await network.fetchCatalogue($('meshSourceUrl').value.trim(),approveSchool);
   drawSearch();report('Catálogo verificado: '+data.publisherId+' · '+data.accepted+' revisión(es). Copia local disponible offline.');}
  catch(e){report('Consulta rechazada: '+e.message);}
  finally{$('meshFetchBtn').disabled=false;}
 };
 $('meshRefreshBtn').onclick=async()=>{
  if(!network)return report('Transporte no disponible.');
  if(!network.sources().length)return report('Todavía no seguís catálogos HTTPS.');
  $('meshRefreshBtn').disabled=true;
  try{const outcomes=await network.refreshAll(approveSchool,message=>report(message));drawSearch();
   report('Actualización finalizada: '+outcomes.filter(x=>x.ok).length+' de '+outcomes.length+' catálogos verificados.');}
  catch(e){report('No se pudo actualizar: '+e.message);}
  finally{$('meshRefreshBtn').disabled=false;}
 };

 $('meshSearchBtn').onclick=drawSearch;
 $('meshSearch').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();drawSearch();}});
 $('meshSearchSubject').onchange=drawSearch;
 drawOwn();drawSearch();
 report('Malla local lista. No hay conexión automática a una red nacional; solo se importan y exportan fichas firmadas expresamente.');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})(globalThis);
