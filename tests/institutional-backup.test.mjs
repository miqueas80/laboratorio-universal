import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const start=app.indexOf('const INSTITUTIONAL_BACKUP_MAX_BYTES=');
const end=app.indexOf('async function exportInstitutionalBackup()',start);
assert.ok(start>0&&end>start,'Institutional backup implementation must be present');
const source=app.slice(start,end);

function harness({records=[{id:'NEXUS-X-0001',name:'Material sintético'}],docs=[],
  storage={},onReadDocs}={}){
 const raw=JSON.stringify(records),files=new Map(),mutations=[];
 let savedRaw=raw,readOnlySource=storage,documentRows=docs,reads=0;
 const sourceRaw=new Map(Object.entries(storage).map(([key,value])=>[key,JSON.stringify(value)]));
 class ZipFake{
  constructor(){this.files=files;}
  file(name,value){this.files.set(name,value);return this;}
  async generateAsync(){return Uint8Array.from([80,75,3,4]);}
 }
 const stub={
  Blob,Uint8Array,TextEncoder,JSON,Date,Number,Set,Array,Error,crypto:webcrypto,
  location:{origin:'https://escuela.test'},APP_VERSION:'unit-test-v1',
  state:{inventoryRaw:raw},CAL_KEY:'nexus_x_calendar_v1',
  JSZip:ZipFake,
  readStorage:key=>key==='nexus_x_inventory_v1'?savedRaw:(sourceRaw.get(key)??null),
  DB_KEY:'nexus_x_inventory_v1',
  readJsonStorage:(key,fallback)=>readOnlySource[key]??fallback,
  validateInventory:(inventory)=>{
   if(!Array.isArray(inventory)||inventory.some(x=>!x.name||!/^NEXUS-X-\d{4}$/.test(x.id))
      ||new Set(inventory.map(x=>x.id)).size!==inventory.length)throw Error('Inventario no válido');
  },
  loadScript:async()=>ZipFake,
  getCachedDocs:async()=>{
   reads++;
   await onReadDocs?.({reads,changeInventory:x=>savedRaw=x,
    changeStorage:(key,value)=>sourceRaw.set(key,JSON.stringify(value)),
    changeDocuments:rows=>documentRows=rows});
   return documentRows;
  },
  // Write traps: generating a backup must never mutate anything.
  writeStorage:()=>mutations.push('storage'),
  putDoc:()=>mutations.push('document'),
  fetch:()=>mutations.push('network')
 };
 const ctx=vm.createContext(stub);
 vm.runInContext(source+'\nthis.makeBackup=buildInstitutionalBackup;',ctx);
 return {build:()=>ctx.makeBackup(),files,mutations,changeInventory:x=>savedRaw=x};
}
async function parseFiles(files){
 const data=JSON.parse(files.get('nexus-x-data.json'));
 const integrity=JSON.parse(files.get('nexus-x-integrity.json'));
 const digest=await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(files.get('nexus-x-data.json')));
 const hex=Buffer.from(digest).toString('hex');
 return {data,integrity,hex};
}
test('Backup: local originals and institutional records are included without network or mutation',async()=>{
 const pdf=new Blob(['%PDF-1.4 test original'],{type:'application/pdf'});
 const h=harness({
  docs:[
   {name:'archivo.pdf',path:'local:archivo.pdf',type:'PDF',text:'test',blob:pdf},
   {name:'publicado.pdf',path:'published:publicado.pdf',type:'PDF',text:'indexado',blob:null}
  ],
  storage:{nexus_x_calendar_v1:[{title:'Clase de química'}],nexus_x_favorites_v1:['NEXUS-X-0001']}
 });
 const result=await h.build();
 const {data,integrity,hex}=await parseFiles(h.files);
 assert.equal(result.blob.type,'application/zip');
 assert.equal(data.inventory.length,1);
 assert.equal(data.documents.length,2);
 assert.equal(data.calendar.length,1);
 assert.equal(data.favorites[0],'NEXUS-X-0001');
 assert.equal(data.documents[1].original,null);
 assert.equal(data.documents[0].original.size,pdf.size);
 assert.equal(data.documents[0].original.archivePath,'originales/00001.bin');
 assert.equal(integrity.originalsUnavailable,1);
 assert.equal(integrity.originals,1);
 assert.equal(integrity.dataSha256,hex);
 assert.equal(data.documents[0].blob,undefined);
 assert.deepEqual(h.mutations,[]);
});

test('Backup: expired inventory snapshot is rejected, without writing anything',async()=>{
 const h=harness();
 h.changeInventory(JSON.stringify([{id:'NEXUS-X-0002',name:'Cambio externo'}]));
 await assert.rejects(h.build(),/Inventario modificado/);
 assert.equal(h.files.size,0);
 assert.deepEqual(h.mutations,[]);
});

test('Backup: changes in another tab while reading documents abort the export',async()=>{
 const h=harness({onReadDocs:async({changeInventory})=>{
  changeInventory(JSON.stringify([{id:'NEXUS-X-9999',name:'Edición paralela'}]));
 }});
 await assert.rejects(h.build(),/cambió durante la exportación/);
 assert.deepEqual(h.mutations,[]);
});

test('Backup: duplicate document paths abort rather than produce an ambiguous archive',async()=>{
 const h=harness({docs:[{path:'local:a.pdf'},{path:'local:a.pdf'}]});
 await assert.rejects(h.build(),/duplicada/);
 assert.deepEqual(h.mutations,[]);
});

test('Backup: enforce 128 MiB original limit before reading oversized binary content',async()=>{
 class OversizeBlob extends Blob { get size(){return 129*1024*1024;} }
 const h=harness({docs:[{path:'local:large.pdf',blob:new OversizeBlob(['tiny'])}]});
 await assert.rejects(h.build(),/superan 128 MiB/);
 assert.deepEqual(h.mutations,[]);
});

test('Backup: detects calendar or favorites updated while building ZIP',async()=>{
 for(const key of ['nexus_x_calendar_v1','nexus_x_favorites_v1']){
  const h=harness({onReadDocs:async({reads,changeStorage})=>{
   if(reads===2)changeStorage(key,[{title:'Cambio externo'}]);
  }});
  await assert.rejects(h.build(),/calendario o los favoritos cambiaron/);
  assert.deepEqual(h.mutations,[]);
 }
});
test('Backup: detects a document introduced by another tab during compression',async()=>{
 const a={path:'local:original.pdf',text:'Texto original',size:12};
 const b={path:'local:externo.pdf',text:'Nuevo archivo',size:10};
 const h=harness({docs:[a],onReadDocs:async({reads,changeDocuments})=>{
  if(reads===2)changeDocuments([a,b]);
 }});
 await assert.rejects(h.build(),/documentos cambiaron/);
 assert.deepEqual(h.mutations,[]);
});
test('Backup: corrupt calendar data must not be silently replaced by an empty calendar',async()=>{
 const h=harness({storage:{nexus_x_calendar_v1:{invalid:true}}});
 await assert.rejects(h.build(),/calendario local inválido/);
 assert.deepEqual(h.mutations,[]);
});
test('Backup: never include gateway credentials or hidden localStorage values',async()=>{
 const h=harness({storage:{
  nexus_x_calendar_v1:[],
  nexus_x_favorites_v1:[],
  nexus_xkiro_api_key_v1:'VERY-SENSITIVE-NOT-TO-EXPORT',
  nexus_xkiro_good_models_v1:{access_token:'PRIVATE'}
 }});
 await h.build();
 const s=h.files.get('nexus-x-data.json');
 assert.ok(!s.includes('VERY-SENSITIVE-NOT-TO-EXPORT'));
 assert.ok(!s.includes('PRIVATE'));
 assert.ok(!s.includes('access_token'));
 assert.deepEqual(h.mutations,[]);
});
