/* NEXUS-X institution workspaces: storage namespaces, never a login or access-control system. */
(function(root){
 'use strict';
 const scope=encodeURIComponent(new URL('./',root.location.href).pathname);
 const REGISTRY_KEY='nexus-x-workspaces:'+scope+':registry';
 const DEFAULT=Object.freeze({id:'personal',name:'Mi espacio inicial'});
 const uuid=/^ws-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
 const acceptable=id=>id==='personal'||uuid.test(String(id||''));
 const cleanName=value=>{
  const name=String(value??'').replace(/[\u0000-\u001f\u007f<>]/g,'').trim().slice(0,85);
  if(name.length<3)throw Error('Ingresá el nombre de la institución (al menos 3 caracteres).');
  return name;
 };
 const initial=()=>({version:1,active:'personal',items:[{...DEFAULT}]});
 const normalized=x=>{
  if(!x||x.version!==1||!Array.isArray(x.items))return initial();
  const items=[];const seen=new Set();
  for(const item of x.items.slice(0,100)){
   if(!acceptable(item?.id)||seen.has(item.id))continue;
   try{items.push({id:item.id,name:cleanName(item.name)});seen.add(item.id);}catch{}
  }
  if(!seen.has('personal'))items.unshift({...DEFAULT});
  return {version:1,active:seen.has(x.active)?x.active:'personal',items};
 };
 const load=()=>{
  try{return normalized(JSON.parse(root.localStorage.getItem(REGISTRY_KEY)||'null'));}
  catch{return initial();}
 };
 const persist=registry=>{
  root.localStorage.setItem(REGISTRY_KEY,JSON.stringify(registry));
  return registry;
 };
 const current=load(); // Locked for this page load: switching always reloads to avoid cross-workspace state.
 const activeId=current.active;
 function list(){return load().items.map(x=>({...x}));}
 function active(){return list().find(x=>x.id===activeId)||{...DEFAULT};}
 function prefix(){return 'nexus-x-institutional:'+scope+':' +(activeId==='personal'?'':'w:'+activeId+':');}
 function databaseSuffix(){return activeId==='personal'?'':'_WS_'+activeId;}
 function create(name){
  const data=load();
  if(data.items.length>=100)throw Error('Límite de espacios locales alcanzado.');
  if(!root.crypto?.randomUUID)throw Error('Este navegador no dispone de generación segura de IDs.');
  const id='ws-'+root.crypto.randomUUID();
  data.items.push({id,name:cleanName(name)});
  persist(data);
  return id;
 }
 function join(id,name){
  if(!uuid.test(String(id||'')))throw Error('El identificador de institución no es válido.');
  const data=load();if(data.items.some(x=>x.id===id))return id;
  if(data.items.length>=100)throw Error('Límite de espacios locales alcanzado.');
  data.items.push({id,name:cleanName(name)});persist(data);
  return id;
 }
 function switchTo(id){
  const data=load();
  if(!data.items.some(x=>x.id===id))throw Error('Ese espacio no existe en este dispositivo.');
  if(id===activeId)return false;
  if(!root.confirm('Se abrirá el espacio seleccionado. Los datos del espacio actual permanecen guardados. ¿Continuar?'))return false;
  data.active=id;persist(data);
  root.location.reload();
  return true;
 }
 root.NexusWorkspaces=Object.freeze({scope,activeId,list,active,prefix,databaseSuffix,create,join,switchTo,acceptable});
})(globalThis);
