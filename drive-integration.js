/* NEXUS-X Drive Bridge: explicit, per-file Google authorization. No tokens persisted. */
(function(root){
 'use strict';
 const SCOPE='https://www.googleapis.com/auth/drive.file';
 const DRIVE='https://www.googleapis.com/drive/v3/files';
 const UPLOAD='https://www.googleapis.com/upload/drive/v3/files';
 const GIS='https://accounts.google.com/gsi/client';
 const GAPI='https://apis.google.com/js/api.js';
 const MAX_BYTES=16*1024*1024;
 const FOLDER='NEXUS-X - Documentos';
 const TYPES=Object.freeze({
  'application/vnd.google-apps.document':{mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',ext:'.docx'},
  'application/vnd.google-apps.spreadsheet':{mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',ext:'.xlsx'},
  'application/vnd.google-apps.presentation':{mime:'application/pdf',ext:'.pdf'}
 });
 const ACCEPT=/\.(pdf|docx|xlsx|xls)$/i;
 let token='',expiry=0,folderId='',pickerPromise=null;
 let gisPromise=null;
 const config=()=>root.NEXUS_CONFIG?.googleDrive||{};
 const validConfig=()=>{
  const {clientId,apiKey,projectNumber}=config();
  return /^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(String(clientId||''))&&
    /^AIza[A-Za-z0-9_-]{20,}$/.test(String(apiKey||''))&&/^\d{6,}$/.test(String(projectNumber||''));
 };
 const connected=()=>Boolean(token&&Date.now()<expiry-60000);
 function online(){
  if(!root.navigator?.onLine)throw Error('Sin Internet. El inventario y los documentos locales siguen disponibles.');
 }
 function ready(){
  online();
  if(!validConfig())throw Error('El administrador debe configurar Google OAuth, Picker y Drive en config.js.');
 }
 function requireToken(){
  ready();
  if(!connected()){token='';folderId='';throw Error('Primero conectá tu cuenta de Google Drive.');}
  return token;
 }
 function script(url,check){
  if(check())return Promise.resolve();
  return new Promise((resolve,reject)=>{
   const el=document.createElement('script');
   el.src=url;el.async=true;
   el.onload=()=>check()?resolve():reject(Error('Google no inicializó la biblioteca solicitada.'));
   el.onerror=()=>reject(Error('No se pudo cargar la biblioteca de Google. Comprobá la conexión.'));
   document.head.append(el);
  });
 }
 async function prepareLogin(){
  ready();
  if(root.google?.accounts?.oauth2)return true;
  if(!gisPromise)gisPromise=script(GIS,()=>Boolean(root.google?.accounts?.oauth2)).catch(e=>{gisPromise=null;throw e});
  await gisPromise;
  return true;
 }
 function connect(){
  ready();
  if(!root.google?.accounts?.oauth2){
   return prepareLogin().then(()=>({prepared:true,connected:false}));
  }
  return new Promise((resolve,reject)=>{
   let done=false;
   try{
    const client=root.google.accounts.oauth2.initTokenClient({
     client_id:config().clientId,
     scope:SCOPE,
     callback:response=>{
      if(done)return;done=true;
      if(!response||response.error||!response.access_token){reject(Error('No se autorizó el acceso a Drive.'));return;}
      token=String(response.access_token);expiry=Date.now()+Math.max(60,Number(response.expires_in||3600))*1000;
      folderId='';
      resolve({connected:true,prepared:false});
     },
     error_callback:()=>{if(!done){done=true;reject(Error('Se canceló o bloqueó el acceso a Google.'));}}
    });
    // OAuth prompt starts on the user's click, never at boot.
    client.requestAccessToken({prompt:'select_account consent'});
   }catch(e){reject(Error('No pudo abrirse el consentimiento de Google: '+(e.message||e)));}
  });
 }
 function disconnect(){
  const old=token;token='';expiry=0;folderId='';
  if(old&&root.google?.accounts?.oauth2?.revoke){try{root.google.accounts.oauth2.revoke(old,()=>{});}catch{}}
  return {connected:false};
 }
 async function responseOk(response){
  if(response.status===401){token='';expiry=0;folderId='';throw Error('La sesión de Drive venció. Conectá de nuevo.');}
  if(!response.ok)throw Error('Google Drive respondió HTTP '+response.status+'. No se modificaron los datos locales.');
  return response;
 }
 function safeName(raw){
  const name=String(raw||'archivo').replace(/[\/\\\u0000-\u001f\u007f]/g,'_').replace(/^\.+/,'').trim().slice(0,200);
  return name||'archivo';
 }
 function filePlan(meta){
  if(!meta||!String(meta.id||'').match(/^[A-Za-z0-9_-]{8,256}$/))throw Error('Identificador de Drive inválido.');
  if(meta.capabilities?.canDownload===false)throw Error('No tenés permiso para descargar este archivo.');
  let name=safeName(meta.name),mime=String(meta.mimeType||'');
  const native=TYPES[mime];
  if(native){name=name.replace(/\.[^.]{1,8}$/,'')+native.ext;mime=native.mime;}
  if(!ACCEPT.test(name))throw Error('Tipo de archivo no admitido: '+name+'. Usá PDF, Word o Excel.');
  if(Number(meta.size||0)>MAX_BYTES)throw Error('Archivo mayor a 16 MB: '+name);
  return {id:meta.id,name,mime,native:Boolean(native)};
 }
 async function api(url,options={}){
  const current=requireToken();
  const res=await fetch(url,{...options,headers:{Authorization:'Bearer '+current,...options.headers},cache:'no-store'});
  return responseOk(res);
 }
 async function downloadSelected(meta){
  const plan=filePlan(meta);
  const base=DRIVE+'/'+encodeURIComponent(plan.id);
  const url=plan.native?base+'/export?mimeType='+encodeURIComponent(plan.mime):base+'?alt=media';
  const res=await api(url);
  const blob=await res.blob();
  if(!blob.size||blob.size>MAX_BYTES)throw Error('El archivo de Drive está vacío o supera 16 MB: '+plan.name);
  return new File([blob],plan.name,{type:plan.mime||blob.type||'application/octet-stream'});
 }
 async function pickerLibrary(){
  if(root.google?.picker?.PickerBuilder)return;
  if(!pickerPromise)pickerPromise=new Promise((resolve,reject)=>{
   script(GAPI,()=>Boolean(root.gapi?.load)).then(()=>{
    root.gapi.load('picker',{callback:resolve,onerror:()=>reject(Error('Google Picker no está disponible.'))});
   }).catch(reject);
  }).catch(e=>{pickerPromise=null;throw e});
  await pickerPromise;
  if(!root.google?.picker?.PickerBuilder)throw Error('Google Picker no se inicializó.');
 }
 async function chooseFiles(onFile,onStatus=()=>{}){
  requireToken();
  if(typeof onFile!=='function')throw Error('Falta el importador de documentos.');
  await pickerLibrary();
  requireToken();
  const p=root.google.picker;
  const view=new p.DocsView(p.ViewId.DOCS);
  view.setMode(p.DocsViewMode.LIST);
  const picker=new p.PickerBuilder()
   .addView(view)
   .enableFeature(p.Feature.MULTISELECT_ENABLED)
   .setMaxItems(20)
   .setOAuthToken(token)
   .setDeveloperKey(config().apiKey)
   .setAppId(String(config().projectNumber))
   .setOrigin(root.location.origin)
   .setTitle('Elegir documentos de la escuela')
   .setCallback(async data=>{
    if(data.action!==p.Action.PICKED)return;
    const picked=(data.docs||[]).slice(0,20);
    let imported=0;
    for(const item of picked){
     try{
      requireToken();
      const id=String(item.id||'');
      if(!/^[A-Za-z0-9_-]{8,256}$/.test(id))throw Error('Identificador de archivo inválido.');
      const response=await api(DRIVE+'/'+encodeURIComponent(id)+'?fields=id,name,mimeType,size,capabilities(canDownload)');
      const metadata=await response.json();
      const file=await downloadSelected(metadata);
      onStatus('Importando '+file.name+'...');
      if(await onFile(file)!==false)imported++;
     }catch(e){onStatus('No se importó un archivo: '+(e.message||e));}
    }
    onStatus('Importados '+imported+' de '+picked.length+' archivos desde Drive. Copias locales disponibles sin Internet.');
   }).build();
  picker.setVisible(true);
  return {opened:true};
 }
 async function ensureFolder(){
  if(folderId)return folderId;
  const q="mimeType = 'application/vnd.google-apps.folder' and name = '"+FOLDER+"' and trashed = false";
  const uri=DRIVE+'?spaces=drive&pageSize=100&fields=files(id,name),nextPageToken&q='+encodeURIComponent(q);
  const list=await (await api(uri)).json();
  const match=Array.isArray(list.files)?list.files.find(x=>x.name===FOLDER&&x.id):null;
  if(match){folderId=match.id;return folderId;}
  const created=await (await api(DRIVE+'?fields=id',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:FOLDER,mimeType:'application/vnd.google-apps.folder'})})).json();
  if(!created?.id)throw Error('No se pudo crear la carpeta NEXUS-X en Drive.');
  folderId=created.id;return folderId;
 }
 function uploadType(file){
  const ext=String(file?.name||'').toLowerCase();
  if(!ACCEPT.test(ext))throw Error('Solo pueden subirse PDF, Word y Excel.');
  if(!file.size||file.size>MAX_BYTES)throw Error('El archivo debe ocupar entre 1 byte y 16 MB.');
  if(/\.pdf$/.test(ext))return 'application/pdf';
  if(/\.docx$/.test(ext))return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if(/\.xlsx$/.test(ext))return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  return 'application/vnd.ms-excel';
 }
 async function upload(file){
  requireToken();
  const mime=uploadType(file);
  const parent=await ensureFolder();
  const metadata={name:safeName(file.name),mimeType:mime,parents:[parent]};
  let result;
  if(file.size<=5*1024*1024){
   const boundary='nexusx'+Math.random().toString(36).slice(2);
   const body=new Blob(['--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n',
    JSON.stringify(metadata),'\r\n--'+boundary+'\r\nContent-Type: '+mime+'\r\n\r\n',
    file,'\r\n--'+boundary+'--\r\n'],{type:'multipart/related; boundary='+boundary});
   const res=await api(UPLOAD+'?uploadType=multipart&fields=id,name,webViewLink',{
    method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body
   });
   result=await res.json();
  }else{
   const init=await api(UPLOAD+'?uploadType=resumable&fields=id,name,webViewLink',{
    method:'POST',
    headers:{'Content-Type':'application/json','X-Upload-Content-Type':mime,'X-Upload-Content-Length':String(file.size)},
    body:JSON.stringify(metadata)
   });
   const next=init.headers.get('Location');
   let session;
   try{session=new URL(next)}catch{throw Error('Google no devolvió una sesión de subida válida.');}
   if(session.protocol!=='https:'||session.hostname!=='www.googleapis.com'||!session.pathname.startsWith('/upload/drive/v3/files')){
    throw Error('URL de subida insegura rechazada.');
   }
   const res=await api(session.href,{method:'PUT',headers:{'Content-Type':mime},body:file});
   result=await res.json();
  }
  if(!result?.id)throw Error('Google no confirmó la subida.');
  return {id:result.id,name:result.name||metadata.name,link:result.webViewLink||''};
 }
 root.NexusDrive=Object.freeze({connect,disconnect,chooseFiles,upload,isConnected:connected,isConfigured:validConfig,filePlan});
})(globalThis);
