/* Optional federator discovery UI. Every remote result is untrusted until signed catalogue verification. */
(function(root){
'use strict';
function start(){
 const api=root.NexusMeshFederator,results=document.getElementById('meshFederatorResults');
 if(!results)return;
 const el=id=>document.getElementById(id),status=el('meshFederatorStatus'),more=el('meshFederatorMoreBtn'),button=el('meshFederatorSearchBtn');
 if(!api){status.textContent='Federador no disponible en esta instalación.';return;}
 const make=(tag,text,cls='')=>{const e=document.createElement(tag);e.textContent=text;e.className=cls;return e;};
 const report=x=>status.textContent=String(x||'');
 let pageState=null;
 const approve=async ({publisherId,fingerprint,count})=>root.confirm(
  'Clave institucional de '+publisherId+'\nHuella: '+fingerprint+
  '\nFichas: '+count+'\n\nVerificá esta huella con la escuela por otro canal. ¿Confiar en ella?');
 function draw(page,append){
  if(!append)results.replaceChildren();
  if(!page.results.length&&!append)results.append(make('p','No hay coincidencias para esta consulta.','muted'));
  for(const hit of page.results){
   const card=make('div','','result-card'),record=hit.record;
   card.append(make('strong',record.title));
   card.append(make('p',record.summary,'muted'));
   card.append(make('p',record.publisherName+' · '+record.subject+' · '+record.level+' · '+record.license,'muted'));
   card.append(make('p','Vista previa no verificada. No se abre el enlace hasta validar firma y origen.','footer-note'));
   const verify=make('button','Verificar firma e incorporar al índice offline','btn teal');
   verify.onclick=async()=>{
    verify.disabled=true;
    try{
     const outcome=await api.verifyAndImport(hit,approve);
     document.getElementById('meshSearchBtn')?.click();
     verify.textContent='Ficha verificada';
     report('Firma correcta y origen aceptado: '+outcome.publisherId+'. '+outcome.accepted+' fichas actualizadas.');
    }catch(error){verify.disabled=false;report('No se importó: '+error.message);}
   };
   card.append(verify);results.append(card);
  }
  more.hidden=!page.hasMore;
 }
 async function search(continuePage=false){
  button.disabled=true;more.disabled=true;
  try{
   const origin=continuePage?pageState.origin:el('meshFederatorOrigin').value.trim();
   const q=continuePage?pageState.q:el('meshSearch').value.trim();
   const subject=continuePage?pageState.subject:el('meshSearchSubject').value;
   const cursor=continuePage?pageState.cursor:0;
   report('Consultando metadatos públicos del federador...');
   const page=await api.search(origin,{q,subject,cursor,limit:10});
   draw(page,continuePage);
   pageState={origin:page.origin,q,subject,cursor:page.cursor,hasMore:page.hasMore};
   report(page.results.length+' vista(s) previa(s) recibidas. Para confiar en una ficha, verificá su firma.');
  }catch(error){report('No se pudo consultar: '+error.message);}
  finally{button.disabled=false;more.disabled=false;}
 }
 button.onclick=()=>search(false);
 more.onclick=()=>{if(pageState?.hasMore)search(true);};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(globalThis);
