/* NEXUS-X — pure ingestion rules for the opt-in national catalogue.
 * No storage, no network, no credentials; rigorously reject truncated or stale snapshots.
 */
export class FederationError extends Error {
 constructor(code,message,status=409){super(message);this.name='FederationError';this.code=code;this.status=status;}
}
const fail=(code,message,status=409)=>{throw new FederationError(code,message,status);};
const valid=condition=>Boolean(condition);
export function createIngestionPlan(verified,school,storedRows,storedFeed=null){
 if(!verified?.feed||!Array.isArray(verified.feed.records))fail('INVALID_SIGNATURE','Firma ausente o no verificada.',400);
 const feed=verified.feed;
 if(!school||school.active!==1||school.publisher_id!==feed.publisherId)fail('UNREGISTERED','Institución desconocida, suspendida o no verificada.',403);
 if(school.public_key!==feed.publicKey)fail('KEY_MISMATCH','La clave no coincide con el registro institucional.',403);
 if(!Number.isSafeInteger(school.epoch)||school.epoch<0)fail('CONFIGURATION_ERROR','Estado institucional inválido.',503);
 if(!Array.isArray(storedRows))fail('CONFIGURATION_ERROR','Estado documental inválido.',503);
 if(storedRows.length>2000||feed.records.length>2000)fail('SNAPSHOT_LIMIT','Catálogo institucional supera el máximo del piloto.',413);
 const seen=new Set();
 const current=new Map();
 for(const row of storedRows){
  if(typeof row.resource_id!=='string'||!Number.isSafeInteger(row.revision)||row.revision<1)fail('DATA_INTEGRITY','Registro existente dañado.',503);
  if(seen.has(row.resource_id))fail('DATA_INTEGRITY','ID duplicado en la base de datos.',503);
  seen.add(row.resource_id);
  let original;try{original=JSON.parse(row.record_json);}catch{fail('DATA_INTEGRITY','Registro existente no es JSON válido.',503);}
  if(original.id!==row.resource_id||original.revision!==row.revision||original.publisherId!==school.publisher_id)fail('DATA_INTEGRITY','No coincide la identidad de un registro existente.',503);
  current.set(row.resource_id,{...row,original});
 }
 const received=new Map(feed.records.map(r=>[r.id,r]));
 if(received.size!==feed.records.length)fail('DUPLICATE_ID','ID duplicado en el catálogo firmado.',400);
 const omitted=[...current.keys()].filter(id=>!received.has(id));
 if(omitted.length)fail('INCOMPLETE_SNAPSHOT','Un catálogo nuevo omitió recursos anteriores. Para retirarlos enviá avisos de retiro firmados.');
 const actions=[];let identical=0;
 for(const next of feed.records){
  if(next.publisherId!==school.publisher_id)fail('CROSS_TENANT','El catálogo contiene metadatos de otra institución.',403);
  const prior=current.get(next.id);
  if(!prior){actions.push(next);continue;}
  if(next.revision<prior.revision)fail('ROLLBACK','Se rechazó una versión histórica del catálogo.');
  // Even if an authorized signer compromises their own key, withdrawn IDs must never be resurrected.
  if(prior.original.status==='withdrawn'&&next.status==='published')fail('WITHDRAWN_REUSED','Un documento retirado requiere un identificador nuevo.');
  const text=JSON.stringify(next);
  const old=JSON.stringify(prior.original);
  if(next.revision===prior.revision){
   if(text!==old)fail('SAME_REVISION_CONFLICT','Revisión igual con contenido diferente.');
   identical++;
  } else actions.push(next);
 }
 if(storedFeed?.signature===feed.signature&&storedFeed?.public_key===feed.publicKey){
  if(actions.length)fail('DATA_INTEGRITY','Firma conocida pero base de datos incompleta.',503);
  return {kind:'replay',publisherId:feed.publisherId,expectedEpoch:school.epoch,accepted:0,unchanged:identical,total:feed.records.length,actions:[]};
 }
 return {kind:'commit',publisherId:feed.publisherId,expectedEpoch:school.epoch,accepted:actions.length,unchanged:identical,total:feed.records.length,actions};
}
export function cleanQuery(raw){
 if(typeof raw!=='string')fail('INVALID_QUERY','Consulta inválida.',400);
 const normalized=raw.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es');
 const terms=normalized.trim().split(/\s+/).filter(Boolean);
 if(!terms.length||terms.length>7||terms.some(t=>t.length>32||!/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u.test(t)))fail('INVALID_QUERY','Buscá usando hasta siete palabras o números.',400);
 const query=terms.map(t=>'"'+t.replace(/"/g,'""')+'"').join(' AND ');
 return query;
}
export function pagination(url){
 const size=url.searchParams.get('limit')||'25',cursor=url.searchParams.get('cursor')||'0';
 if(!/^\d{1,3}$/.test(size)||!Number.isSafeInteger(+size)||+size<1||+size>100)fail('INVALID_LIMIT','Límite entre 1 y 100.',400);
 if(!/^\d{1,12}$/.test(cursor)||!Number.isSafeInteger(+cursor)||+cursor<0)fail('INVALID_CURSOR','Cursor numérico inválido.',400);
 return {limit:+size,cursor:+cursor};
}
