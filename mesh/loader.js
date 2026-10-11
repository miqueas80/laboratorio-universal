/* NEXUS-X Optional Mesh — never loads on normal application boot.
 * This tiny bootstrap only runs if a user opens the Malla Federal view.
 * A failed optional resource must never change NEXUS's core state.
 */
(function(root){
'use strict';
const files=Object.freeze([
 'core.js','local.js','network.js','federator-client.js','federator-ui.js','ui.js'
]);
const base=new URL('./',document.currentScript?.src||root.location.href);
const makeURL=name=>new URL(name,base).href;
let loading=null,loaded=false,progress=0;
function status(message){
 const target=document.getElementById('meshStatus')||document.getElementById('meshFederatorStatus');
 if(target)target.textContent=message;
}
function install(name){
 return new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src=makeURL(name);
  script.async=false;
  script.dataset.nexusOptionalMesh='true';
  script.onload=()=>resolve();
  script.onerror=()=>reject(Error('No se pudo cargar '+name+'. Conectate a Internet y volvé a intentarlo.'));
  document.head.appendChild(script);
 });
}
function load(){
 if(loaded)return Promise.resolve(true);
 if(loading)return loading;
 status('Cargando complemento educativo opcional…');
 loading=(async()=>{
  for(;progress<files.length;progress++)await install(files[progress]);
  loaded=true;
  return true;
 })().catch(error=>{
  status('Malla Federal no disponible: '+error.message+'. El resto de NEXUS sigue funcionando.');
  throw error;
 }).finally(()=>{loading=null;});
 return loading;
}
root.NexusMeshLoader=Object.freeze({load,get loaded(){return loaded;},files:[...files]});
})(globalThis);
