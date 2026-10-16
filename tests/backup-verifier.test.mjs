import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash,webcrypto} from 'node:crypto';

const source=fs.readFileSync(new URL('../backup-verify.js',import.meta.url),'utf8');
const context=vm.createContext({crypto:webcrypto,Uint8Array,TextEncoder,TextDecoder,Array,Set,Number,Object,
 Error,RegExp,JSON,Promise});
vm.runInContext(source,context,{filename:'backup-verify.js'});
const verify=context.NexusBackupVerifier.verify;
const encoder=new TextEncoder(),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const original=encoder.encode('%PDF-1.4\nNEXUS-X-0001 synthetic\n');

function fixture({inventory=[{id:'NEXUS-X-0001',name:'Reactivo de prueba'}],
 docs, extra=[],metaMutator=()=>{},proofMutator=()=>{},size=120,
 entrySize={}}={}){
 const defaultDocs=[
  {path:'local:doc.pdf',name:'doc.pdf',type:'PDF',
   original:{archivePath:'originales/00001.bin',size:original.length,mime:'application/pdf',sha256:sha(original)}},
  {path:'published:doc2.pdf',name:'doc2.pdf',type:'PDF',original:null}
 ];
 const data={format:'nexus-x-institutional-backup',schemaVersion:1,inventory,
  calendar:[],favorites:[],documents:docs||defaultDocs,originHint:'https://escuela.test',
  createdAt:'2026-10-15T00:00:00Z'};
 metaMutator(data);
 const dataBytes=encoder.encode(JSON.stringify(data));
 const proof={schemaVersion:1,dataSha256:sha(dataBytes),
  originals:data.documents.filter(d=>d.original).length,
  originalsUnavailable:data.documents.filter(d=>!d.original).length,
  originalBytes:data.documents.reduce((s,d)=>s+(d.original?.size||0),0)};
 proofMutator(proof);
 const files=new Map([
  ['nexus-x-data.json',dataBytes],
  ['nexus-x-integrity.json',encoder.encode(JSON.stringify(proof))],
  ['originales/00001.bin',original]
 ]);
 for(const name of extra)files.set(name,encoder.encode('malicious'));
 const zip={files:{}};
 for(const [name,bytes] of files){
  zip.files[name]={
   dir:false,_data:{uncompressedSize:entrySize[name]??bytes.length},
   async:async kind=>kind==='text'?new TextDecoder().decode(bytes):bytes
  };
 }
 zip.file=name=>zip.files[name]||null;
 const JSZip={loadAsync:async()=>zip};
 const file={size,async arrayBuffer(){return new Uint8Array([80,75,3,4]).buffer}};
 return {file,JSZip,data,proof,zip};
}
const check=options=>{const f=fixture(options);return verify(f.file,f.JSZip);};

test('ZIP verifier accepts complete archive and validates SHA-256 of all originals',async()=>{
 const result=await check();
 assert.equal(result.valid,true);
 assert.equal(result.summary.records,1);
 assert.equal(result.summary.documents,2);
 assert.equal(result.summary.originals,1);
 assert.equal(result.summary.originalsUnavailable,1);
 assert.equal(result.summary.originalBytes,original.length);
});

test('ZIP verifier rejects tampered manifest hash before reading any original',async()=>{
 await assert.rejects(check({proofMutator:x=>x.dataSha256='0'.repeat(64)}),/SHA-256 del inventario/);
});
test('ZIP verifier rejects tampered original, even when archive advertises a valid manifest',async()=>{
 const docs=[{path:'local:doc.pdf',original:{archivePath:'originales/00001.bin',
  size:original.length,mime:'application/pdf',sha256:'0'.repeat(64)}}];
 await assert.rejects(check({docs}),/SHA-256 de archivo original/);
});
test('ZIP verifier rejects extra or traversal entries',async()=>{
 for(const name of ['../outside','originales/../../outside.bin','evil.js','originales/99999.bin']){
  await assert.rejects(check({extra:[name]}),/rutas inesperadas|archivos extra/);
 }
});
test('ZIP verifier rejects duplicate inventory identities',async()=>{
 await assert.rejects(check({inventory:[
  {id:'NEXUS-X-0001',name:'Uno'},{id:'NEXUS-X-0001',name:'Duplicado'}
 ]}),/duplicados/);
});
test('ZIP verifier rejects duplicate document paths',async()=>{
 const docs=[
  {path:'local:doc.pdf',original:null},
  {path:'local:doc.pdf',original:null}
 ];
 await assert.rejects(check({docs}),/duplicada/);
});
test('ZIP verifier rejects forged original sizes and oversized decompressed content',async()=>{
 await assert.rejects(check({entrySize:{'originales/00001.bin':900}}),/tamaño incompatible/);
 await assert.rejects(check({entrySize:{'nexus-x-data.json':70*1024*1024}}),/datos descomprimidos/);
});
test('ZIP verifier rejects archives with originals missing from ZIP',async()=>{
 const f=fixture();delete f.zip.files['originales/00001.bin'];
 await assert.rejects(verify(f.file,f.JSZip),/original faltante/);
});
test('ZIP verifier rejects counter inconsistencies and unsupported schema',async()=>{
 await assert.rejects(check({proofMutator:x=>x.originals++}),/contador de originales/);
 await assert.rejects(check({metaMutator:x=>x.schemaVersion=2}),/versión no compatible/);
});
test('ZIP verifier rejects oversized compressed input before invoking decompression',async()=>{
 const f=fixture({size:161*1024*1024});
 let called=false;f.JSZip.loadAsync=async()=>{called=true;return f.zip};
 await assert.rejects(verify(f.file,f.JSZip),/demasiado grande/);
 assert.equal(called,false);
});
