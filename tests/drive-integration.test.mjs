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
