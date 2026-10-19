import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const start=source.indexOf('async function countDocumentRecoveryFootprint()');
const end=source.indexOf('async function auditInterruptedRestore()',start);
assert.ok(start>=0&&end>start,'recovery document footprint helper must exist');
const helper=source.slice(start,end);
assert.doesNotMatch(helper,/\bgetAll\s*\(/,'recovery audit may not clone entire document collection');

function simulateIndexedDb(records,{fail=false}={}){
 let opened=0,closed=0,visited=0,readMode='';
 const db={
  close(){closed++;},
  transaction(name,mode){
   assert.equal(name,'documents');
   readMode=mode;
   const tx={error:null};
   tx.objectStore=()=>({
    getAll(){throw new Error('Unbounded getAll must never run');},
    openCursor(){
     opened++;
     const cursor={result:null};
     let index=0;
     function advance(){
      queueMicrotask(()=>{
       if(fail){
        tx.error=new Error('IndexedDB cursor failed');
        tx.onerror();
        return;
       }
       if(index>=records.length){
        cursor.result=null;cursor.onsuccess();
        tx.oncomplete();return;
       }
       const row=records[index++];
       visited++;
       cursor.result={value:row,continue:advance};
       cursor.onsuccess();
      });
     }
     advance();
     return cursor;
    }
   });
   return tx;
  }
 };
 const context=vm.createContext({Blob,Promise,Error,DOC_STORE:'documents',openDocDB:async()=>db});
 vm.runInContext(helper+'this.audit=countDocumentRecoveryFootprint;',context);
 return {execute:()=>context.audit(),metrics:()=>({opened,closed,visited,readMode})};
}

test('Recovery audit scans 3000 institutional document records with one readonly cursor',async()=>{
 const rows=Array.from({length:3000},(_,i)=>({path:'synthetic:'+i,
  blob:i%3===0?new Blob([new Uint8Array(12)]):null}));
 const h=simulateIndexedDb(rows);
 const result=await h.execute();
 assert.equal(result.count,3000);
 assert.equal(result.originals,1000);
 assert.equal(result.originalBytes,12000);
 assert.deepEqual(h.metrics(),{opened:1,closed:1,visited:3000,readMode:'readonly'});
});

test('Recovery audit counts empty document database and closes connection',async()=>{
 const h=simulateIndexedDb([]);
 const result=await h.execute();
 assert.equal(result.count,0);
 assert.equal(result.originals,0);
 assert.equal(result.originalBytes,0);
 assert.equal(h.metrics().closed,1);
});

test('Recovery audit propagates storage failure and always closes database',async()=>{
 const h=simulateIndexedDb([{path:'a'}],{fail:true});
 await assert.rejects(h.execute(),/IndexedDB cursor failed/);
 assert.equal(h.metrics().closed,1);
 assert.equal(h.metrics().readMode,'readonly');
});
