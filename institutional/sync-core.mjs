/**
 * NEXUS-X Universal — institutional synchronization protocol v1.
 *
 * This module is transport-independent. The in-memory ledger is a reference
 * implementation and test oracle, NOT a hosted security boundary or database.
 * A server MUST verify identity and membership BEFORE building a principal.
 * No browser-provided role, tenant or "verified" flag is authoritative.
 */
export const PROTOCOL_VERSION = 1;
export const MAX_BATCH = 50;
export const MAX_OPERATION_BYTES = 65536;
const TENANT=/^ws-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const OP_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SUBJECT=/^[A-Za-z0-9:_@.+-]{3,128}$/;
const CAL_ID=/^event-[A-Za-z0-9_-]{6,100}$/;
const INVENTORY_ID=/^NEXUS-X-\d{4,8}$/;
const ENTITY=new Set(['inventory','calendar']);
const ROLES=new Set(['admin','teacher','viewer']);
const ALLOWED_FIELDS=Object.freeze({
 inventory:new Set(['id','record','originalNumber','name','formula','physicalState','presentation','originalPackage','expiry','location','notes','source']),
 calendar:new Set(['id','date','text'])
});
const assert=(condition,message)=>{if(!condition)throw new TypeError(message);};

function own(object,key){return Object.prototype.hasOwnProperty.call(object,key);}
function canonical(value,depth=0){
 assert(depth<=12,'Máxima profundidad excedida.');
 if(value===null)return 'null';
 if(typeof value==='string')return JSON.stringify(value);
 if(typeof value==='number'){assert(Number.isFinite(value),'Número inválido.');return JSON.stringify(value);}
 if(typeof value==='boolean')return JSON.stringify(value);
 if(Array.isArray(value)){assert(value.length<=200,'Arreglo demasiado extenso.');return '['+value.map(x=>canonical(x,depth+1)).join(',')+']';}
 assert(value&&typeof value==='object','Solo se admiten estructuras JSON.');
 assert(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null,'Objeto con prototipo inválido.');
 const keys=Object.keys(value);
 assert(keys.length<=48,'Demasiadas propiedades.');
 for(const key of keys)assert(!['__proto__','prototype','constructor'].includes(key),'Propiedad insegura.');
 return '{'+keys.sort().map(key=>JSON.stringify(key)+':'+canonical(value[key],depth+1)).join(',')+'}';
}
function copy(value){return JSON.parse(canonical(value));}
function size(value){return new TextEncoder().encode(canonical(value)).length;}
function validPayload(entity,payload,id){
 assert(payload&&typeof payload==='object'&&!Array.isArray(payload),'Contenido de operación inválido.');
 const fields=ALLOWED_FIELDS[entity];
 for(const key of Object.keys(payload)){
  assert(fields.has(key),'Campo no permitido: '+key);
  const v=payload[key];
  assert(['string','number','boolean'].includes(typeof v)||v===null,'Campo complejo no permitido.');
  if(typeof v==='string')assert(v.length<=4096,'Campo demasiado extenso.');
 }
 assert(payload.id===id,'ID del contenido no coincide con el evento.');
 if(entity==='inventory'){
  assert(typeof payload.name==='string'&&payload.name.trim()&&payload.name.length<=240,'Nombre obligatorio.');
  assert(payload.record===undefined||Number.isSafeInteger(payload.record)&&payload.record>=0,'Número de registro inválido.');
 } else {
  assert(/^\d{4}-\d{2}-\d{2}$/.test(payload.date||'')&&!Number.isNaN(Date.parse(payload.date+'T12:00:00Z')),'Fecha de calendario inválida.');
  assert(typeof payload.text==='string'&&payload.text.trim()&&payload.text.length<=1024,'Descripción de calendario inválida.');
 }
}
export function validateOperation(input){
 assert(input&&typeof input==='object'&&!Array.isArray(input),'Operación inválida.');
 const expected=['v','tenantId','opId','actor','entity','entityId','kind','baseVersion','payload'];
 assert(Object.keys(input).length===expected.length&&Object.keys(input).every(x=>expected.includes(x)),'Esquema de operación desconocido.');
 assert(input.v===PROTOCOL_VERSION,'Versión de protocolo incompatible.');
 assert(TENANT.test(input.tenantId),'Identificador de institución inválido.');
 assert(OP_ID.test(input.opId),'Identificador de operación inválido.');
 assert(SUBJECT.test(input.actor),'Identidad de emisor inválida.');
 assert(ENTITY.has(input.entity),'Tipo de entidad no admitida.');
 assert(input.entity==='inventory'?INVENTORY_ID.test(input.entityId):CAL_ID.test(input.entityId),'Identificador de entidad inválido.');
 assert(['upsert','delete'].includes(input.kind),'Acción desconocida.');
 assert(Number.isSafeInteger(input.baseVersion)&&input.baseVersion>=0,'Versión base inválida.');
 if(input.kind==='upsert')validPayload(input.entity,input.payload,input.entityId);
 else assert(input.payload===null,'La eliminación requiere payload=null.');
 assert(size(input)<=MAX_OPERATION_BYTES,'Operación excede el tamaño máximo.');
 return copy(input);
}
export function assertTrustedPrincipal(principal,tenantId,action){
 // Only use in server-side code AFTER a trusted token verifier + membership lookup.
 // A request body must NEVER be accepted as principal.
 assert(principal&&principal.identityVerified===true&&principal.membershipVerified===true,'Identidad/membresía no verificadas.');
 assert(TENANT.test(tenantId)&&principal.tenantId===tenantId,'Acceso entre instituciones denegado.');
 assert(SUBJECT.test(principal.subject)&&ROLES.has(principal.role),'Identidad o rol inválido.');
 if(action==='write')assert(['admin','teacher'].includes(principal.role),'Permisos insuficientes.');
 else assert(action==='read','Acción no admitida.');
 return true;
}
/** In-memory contract reference for tests, not multi-user persistent storage. */
export class ReferenceLedger {
 #tenant;#revision=0;#state=new Map();#ops=new Map();#changes=[];#maxChanges;
 constructor(tenantId,{maxChanges=100000}={}){
  assert(TENANT.test(tenantId),'Institución inválida.');
  assert(Number.isSafeInteger(maxChanges)&&maxChanges>0,'Límite inválido.');
  this.#tenant=tenantId;this.#maxChanges=maxChanges;
 }
 get tenantId(){return this.#tenant;}
 get revision(){return this.#revision;}
 #key(entity,id){return entity+'\u0000'+id;}
 read(principal,entity,id){
  assertTrustedPrincipal(principal,this.#tenant,'read');
  assert(ENTITY.has(entity),'Entidad desconocida.');
  assert((entity==='inventory'?INVENTORY_ID:CAL_ID).test(id),'ID inválido.');
  const item=this.#state.get(this.#key(entity,id));
  return item?copy(item):null;
 }
 changes(principal,{after=0,limit=100}={}){
  assertTrustedPrincipal(principal,this.#tenant,'read');
  assert(Number.isSafeInteger(after)&&after>=0&&after<=this.#revision,'Cursor inválido.');
  assert(Number.isSafeInteger(limit)&&limit>=1&&limit<=500,'Límite inválido.');
  const events=this.#changes.filter(x=>x.revision>after).slice(0,limit);
  const cursor=events.length?events.at(-1).revision:after;
  return {tenantId:this.#tenant,revision:this.#revision,cursor,hasMore:cursor<this.#revision,events:copy(events)};
 }
 /**
  * Transactional batch: either all new operations apply, or none do.
  * Repeated opId + identical canonical payload returns original revision.
  * Repeated opId + different payload is rejected; concurrent writes conflict.
  */
 apply(principal,rawOperations){
  assertTrustedPrincipal(principal,this.#tenant,'write');
  assert(Array.isArray(rawOperations)&&rawOperations.length>=1&&rawOperations.length<=MAX_BATCH,'Lote inválido.');
  const incoming=rawOperations.map(validateOperation);
  const staged=new Map(this.#state);
  const stagedOps=new Map(this.#ops);
  const stagedChanges=[];
  let nextRevision=this.#revision;
  let newlyAccepted=0;
  const receipts=[];
  const conflicts=[];
  for(const op of incoming){
   assert(op.tenantId===this.#tenant,'Una operación intenta cruzar instituciones.');
   assert(op.actor===principal.subject,'Emisor no coincide con sesión verificada.');
   const signature=canonical(op);
   const previous=stagedOps.get(op.opId);
   if(previous){
    if(previous.signature!==signature)conflicts.push({opId:op.opId,reason:'OP_ID_REUSED'});
    else receipts.push({opId:op.opId,revision:previous.revision,replayed:true});
    continue;
   }
   const key=this.#key(op.entity,op.entityId);
   const record=staged.get(key);
   const currentVersion=record?.version??0;
   if(op.baseVersion!==currentVersion){
    conflicts.push({opId:op.opId,entity:op.entity,entityId:op.entityId,expected:op.baseVersion,actual:currentVersion,reason:'VERSION_CONFLICT'});
    continue;
   }
   const nextRecord={entity:op.entity,entityId:op.entityId,version:currentVersion+1,deleted:op.kind==='delete',payload:op.kind==='delete'?null:copy(op.payload)};
   staged.set(key,nextRecord);
   const revision=++nextRevision;
   const event={revision,opId:op.opId,actor:op.actor,entity:op.entity,entityId:op.entityId,kind:op.kind,version:nextRecord.version,payload:nextRecord.payload};
   stagedChanges.push(event);
   stagedOps.set(op.opId,{signature,revision});
   receipts.push({opId:op.opId,revision,replayed:false});
   newlyAccepted++;
  }
  if(conflicts.length)return {ok:false,code:'CONFLICT',revision:this.#revision,conflicts:copy(conflicts),committed:0};
  if(this.#changes.length+stagedChanges.length>this.#maxChanges)return {ok:false,code:'CAPACITY',revision:this.#revision,committed:0};
  this.#state=staged;this.#ops=stagedOps;this.#changes.push(...stagedChanges);this.#revision=nextRevision;
  return {ok:true,revision:this.#revision,committed:newlyAccepted,receipts:copy(receipts)};
 }
}
