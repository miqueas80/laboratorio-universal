/* NEXUS Knowledge Core: evidencias locales con correspondencias conservadoras.
 * Sin red, sin modelos externos y sin escritura en inventario o documentos.
 * NO es un modelo generativo: devuelve evidencia verificable o incertidumbre. */
(function(root){
 'use strict';
 const STOP=new Set('a al de del el la los las un una unos unas que cual cuales es son en sobre para por con sin y o como donde cuando cuanto cuantos quiero necesito porfavor favor decime dime explicame explicar explica informe informacion datos tengo tienen tenemos tenemos hay nuestro nuestra nuestros nuestras documento documentos archivo archivos busca buscar buscame mostrame muestrame mostrar nexus nexo saber me su sus se lo le haceme dame tema acerca relacion relacionada relacionados sirve esto ese esa este esta aqui allí'.split(' '));
 const ALIAS=Object.freeze({nitricos:'nitrico',nitricas:'nitrica',acidos:'acido',oxidos:'oxido',matraces:'matraz',erlenmeyers:'erlenmeyer',probeta:'probeta',probetas:'probeta',pipetas:'pipeta',pipeta:'pipeta',reactivos:'reactivo',sustancias:'sustancia'});
 const clean=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
 function terms(input){
  const found=new Set(),out=[];
  for(const raw of (clean(input).match(/[a-z0-9]+/g)||[])){
   const word=ALIAS[raw]||raw;
   if(word.length<2||STOP.has(word)||found.has(word))continue;
   found.add(word);out.push(word);if(out.length>=8)break;
  }
  return out;
 }
 function oneEdit(a,b){
  if(a.length<5||b.length<5||a.slice(0,2)!==b.slice(0,2)||Math.abs(a.length-b.length)>1)return false;
  let i=0,j=0,errors=0;
  while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue}
   if(++errors>1)return false;
   if(a.length>b.length)i++;else if(b.length>a.length)j++;else{i++;j++;}
  }
  return errors+(a.length-i)+(b.length-j)<=1;
 }
 function tokenFound(term,value,{typos=false}={}){
  const val=clean(value);
  if(!val)return false;
  const words=val.split(' ');
  return words.some(w=>w===term||(term.length>=4&&w.startsWith(term))||(typos&&oneEdit(term,w)));
 }
 function snippet(value,queryTerms){
  const text=String(value||'').replace(/\s+/g,' ').trim();if(!text)return '';
  const normalized=clean(text);
  let index=-1;
  for(const term of queryTerms){const i=normalized.indexOf(term);if(i>=0&&(index<0||i<index))index=i;}
  if(index<0)return text.slice(0,320)+(text.length>320?'…':'');
  // Índice normalizado aproximado: usar la ventana solamente como evidencia citada,
  // no afirmar que se trata de una definición.
  const start=Math.max(0,index-90),end=Math.min(text.length,index+260);
  return (start?'…':'')+text.slice(start,end)+(end<text.length?'…':'');
 }
 function find(question,{inventory=[],documents=[]}={}){
  const q=terms(question);
  if(!q.length)return {supported:false,reason:'empty-terms'};
  const scored=[];
  for(const r of inventory){
   if(!r||typeof r!=='object'||!r.id)continue;
   const name=String(r.name||''),formula=String(r.formula||''),id=String(r.id||'');
   const fields=[{value:name,weight:5},{value:formula,weight:7},{value:id,weight:8},{value:r.location||'',weight:1}];
   let hit=0,weight=0,primary=0;
   for(const t of q){
    const best=fields.reduce((top,f,index)=>{const match=tokenFound(t,f.value,{typos:index===0});return match&&f.weight>top?f.weight:top},0);
    if(best){hit++;weight+=best;if(best>=5)primary++;}
   }
   const coverage=hit/q.length;
   if(coverage<0.75||primary===0)continue;
   const exact=clean(name)===clean(question)||clean(id)===clean(question);
   scored.push({type:'inventory',record:r,coverage,score:weight/q.length+(exact?12:0),source:id});
  }
  for(const d of documents){
   if(!d||typeof d!=='object'||!d.path)continue;
   const title=String(d.name||d.path),chunks=Array.isArray(d.chunks)&&d.chunks.length?d.chunks:[d.text||''];
   const titleHits=q.filter(t=>tokenFound(t,title)).length;
   for(let i=0;i<Math.min(chunks.length,240);i++){
    const chunk=String(chunks[i]||'');
    if(!chunk)continue;
    const normChunk=clean(chunk);
    let hits=0;
    for(const t of q)if(normChunk.includes(t))hits++;
    const coverage=Math.max(hits,titleHits)/q.length;
    if(coverage<0.75)continue;
    const score=coverage*4+(titleHits/q.length)*3+(hits/q.length);
    scored.push({type:'document',document:d,chunk,index:i,coverage,score,source:d.path});
   }
  }
  scored.sort((a,b)=>b.coverage-a.coverage||b.score-a.score||a.source.localeCompare(b.source));
  if(!scored.length)return {supported:false,reason:'no-strong-match',queryTerms:q};
  const best=scored[0];
  // Una palabra como "ácido" puede describir varios frascos: nunca elegir el
  // primero de la lista como si fuera una identificación inequívoca.
  if(best.type==='inventory'&&scored.some(other=>other!==best&&other.type==='inventory'&&other.coverage===best.coverage&&other.score===best.score))
   return {supported:false,reason:'ambiguous-inventory',queryTerms:q};
  if(best.type==='inventory')return {supported:true,type:'inventory',source:best.source,confidence:best.coverage,record:{id:best.record.id,name:best.record.name,formula:best.record.formula||'',location:best.record.location||''},queryTerms:q};
  return {supported:true,type:'document',source:best.source,confidence:best.coverage,title:best.document.name||best.document.path,index:best.index,excerpt:snippet(best.chunk,q),queryTerms:q};
 }
 root.NexusKnowledge=Object.freeze({find,terms});
})(globalThis);
