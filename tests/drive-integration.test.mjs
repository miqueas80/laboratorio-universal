import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';
const read=x=>readFileSync(resolve(process.cwd(),x),'utf8');
function bridge(){
 const context={navigator:{onLine:true},NEXUS_CONFIG:{googleDrive:{clientId:'123.apps.googleusercontent.com',apiKey:'AIzaABCDEFGHIJKLMNOPQRSTUVW',projectNumber:'1234567890'}},location:{origin:'https://escuela.example'}};
 context.globalThis=context;
 vm.runInNewContext(read('drive-integration.js'),context);
 return context.NexusDrive;
}
test('Bridge JS: sintaxis y API mínima',()=>{
 const script=read('drive-integration.js');assert.doesNotThrow(()=>new Function(script));
 const b=bridge();for(const key of ['connect','disconnect','upload','chooseFiles','filePlan','isConnected','isConfigured'])assert.equal(typeof b[key],'function');
});
test('Sin credenciales, Drive permanece desactivado',()=>{
 const context={navigator:{onLine:true},NEXUS_CONFIG:{googleDrive:{}},location:{origin:'https://escuela.example'}};
 context.globalThis=context;vm.runInNewContext(read('drive-integration.js'),context);
 assert.equal(context.NexusDrive.isConfigured(),false);assert.throws(()=>context.NexusDrive.connect(),/configurar Google/);
});
test('Planifica exportación de Google Docs a Word',()=>{
 const b=bridge();const f=b.filePlan({id:'ABCdefghi_12345',name:'Proyecto escolar',mimeType:'application/vnd.google-apps.document'});
 assert.equal(f.name,'Proyecto escolar.docx');assert.equal(f.native,true);
});
test('Planifica exportación de Sheets a Excel',()=>{
 const b=bridge();const f=b.filePlan({id:'ABCdefghi_12345',name:'Inventario',mimeType:'application/vnd.google-apps.spreadsheet'});
 assert.equal(f.name,'Inventario.xlsx');
});
test('Rechaza archivos no admitidos y descargas no autorizadas',()=>{
 const b=bridge();assert.throws(()=>b.filePlan({id:'ABCdefghi_12345',name:'foto.jpg',mimeType:'image/jpeg'}),/no admitido/);
 assert.throws(()=>b.filePlan({id:'ABCdefghi_12345',name:'datos.pdf',capabilities:{canDownload:false}}),/permiso/);
 assert.throws(()=>b.filePlan({id:'ABCdefghi_12345',name:'datos.pdf',size:20000000}),/16 MB/);
});
test('OAuth con acceso limitado, no persiste tokens ni arranca solo',()=>{
 const s=read('drive-integration.js');
 assert.ok(s.includes('https://www.googleapis.com/auth/drive.file'));
 assert.ok(!/localStorage|sessionStorage|indexedDB\.open/.test(s));
 assert.ok(!/drive\.readonly|drive\.metadata\.readonly|auth\/drive[\\x27"]/.test(s));
 assert.ok(read('index.html').includes('id="driveImportBtn"'));
 assert.ok(read('sw.js').includes("'./drive-integration.js'"));
 assert.ok(read('app.js').includes('bindDriveIntegration()'));
});


test('Importación mediante selector del dispositivo disponible sin OAuth',()=>{
 const html=read('index.html'),app=read('app.js');
 assert.ok(html.includes('id="driveDeviceImportBtn"'));
 assert.ok(app.includes("deviceImport.onclick=()=>"));
 assert.ok(app.includes("localInput.click()"));
 assert.ok(app.includes("const localInput=$('#documentInput')"));
});

function driveSession(fetchImpl){
 const requests=[];
 let revoked=false,authorization=null;
 const cfg={clientId:'123.apps.googleusercontent.com',apiKey:'AIzaABCDEFGHIJKLMNOPQRSTUVW',projectNumber:'1234567890'};
 const context={
  navigator:{onLine:true},
  NEXUS_CONFIG:{googleDrive:cfg},
  location:{origin:'https://escuela.example'},
  google:{accounts:{oauth2:{
   initTokenClient(options){
    authorization=options;
    return {requestAccessToken(){options.callback({access_token:'test-access-token',expires_in:3600})}};
   },
   revoke(_token,callback){revoked=true;callback?.();}
  }}},
  Blob,File,URL,Response,
  fetch:async (url,opts)=>{
   requests.push({url:String(url),opts});
   return fetchImpl(String(url),opts);
  }
 };
 context.globalThis=context;
 vm.runInNewContext(read('drive-integration.js'),context);
 return {bridge:context.NexusDrive,requests,authorized:()=>authorization,revoked:()=>revoked};
}

test('OAuth usa exclusivamente drive.file y desconectar revoca credencial temporal',async()=>{
 const d=driveSession(()=>{throw Error('Sin llamadas HTTP al conectar')});
 assert.equal(d.bridge.isConnected(),false);
 const result=await d.bridge.connect();
 assert.equal(result.connected,true);
 assert.equal(d.authorized().scope,'https://www.googleapis.com/auth/drive.file');
 assert.equal(d.bridge.isConnected(),true);
 d.bridge.disconnect();
 assert.equal(d.bridge.isConnected(),false);
 assert.equal(d.revoked(),true);
});

test('Subida a Drive crea carpeta y archivo con Bearer efímero, sin afectar almacenamiento local',async()=>{
 const folderId='folder123456789';
 const d=driveSession(async (url,opts)=>{
  if(url.includes('spaces=drive'))return new Response(JSON.stringify({files:[]}),{status:200});
  if(url.endsWith('/files?fields=id')&&opts.method==='POST')
   return new Response(JSON.stringify({id:folderId}),{status:200});
  if(url.includes('uploadType=multipart')&&opts.method==='POST')
   return new Response(JSON.stringify({id:'file123456789',name:'guia.pdf'}),{status:200});
  throw Error('Solicitud inesperada: '+url);
 });
 await d.bridge.connect();
 const file=new File([new Uint8Array([37,80,68,70])],'guia.pdf',{type:'application/pdf'});
 const result=await d.bridge.upload(file);
 assert.equal(result.id,'file123456789');
 assert.equal(result.name,'guia.pdf');
 assert.equal(d.requests.length,3);
 for(const req of d.requests)assert.equal(req.opts.headers.Authorization,'Bearer test-access-token');
 const create=d.requests.find(req=>req.url.endsWith('/files?fields=id'));
 assert.equal(JSON.parse(create.opts.body).mimeType,'application/vnd.google-apps.folder');
 assert.ok(d.requests.some(req=>req.url.includes('uploadType=multipart')));
});

test('Error 401 invalida sesión y conserva el modo local',async()=>{
 const d=driveSession(async()=>new Response('token inválido',{status:401}));
 await d.bridge.connect();
 const file=new File([new Uint8Array([1,2,3])],'documento.pdf',{type:'application/pdf'});
 await assert.rejects(()=>d.bridge.upload(file),/La sesión de Drive venció/);
 assert.equal(d.bridge.isConnected(),false);
});

test('Sin conexión, Google no se usa y las funciones locales no quedan bloqueadas',()=>{
 const context={navigator:{onLine:false},NEXUS_CONFIG:{googleDrive:{clientId:'123.apps.googleusercontent.com',apiKey:'AIzaABCDEFGHIJKLMNOPQRSTUVW',projectNumber:'1234567890'}},location:{origin:'https://escuela.example'}};
 context.globalThis=context;
 vm.runInNewContext(read('drive-integration.js'),context);
 assert.throws(()=>context.NexusDrive.connect(),/Sin Internet/);
});
