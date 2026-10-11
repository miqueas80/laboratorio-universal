'use strict';
// Lectores existentes, aislados del hilo de UI. El worker no accede a datos locales.
self.onmessage=async ({data})=>{
 try{
  const {kind,buffer}=data;
  if(!(buffer instanceof ArrayBuffer)||buffer.byteLength>16*1024*1024)throw new Error('Archivo demasiado grande o inválido.');
  if(kind==='docx'){
   importScripts('./jszip.min.js');
   const zip=await JSZip.loadAsync(buffer),entry=zip.file('word/document.xml');
   if(!entry)throw new Error('DOCX dañado: falta word/document.xml');
   if(entry._data?.uncompressedSize>12*1024*1024)throw new Error('Word descomprimido demasiado grande.');
   const xml=await entry.async('text');if(xml.length>12*1024*1024)throw new Error('Word demasiado grande.');
   self.postMessage({xml});
  }else if(kind==='spreadsheet'){
   importScripts('./xlsx.full.min.js');
   const wb=XLSX.read(buffer,{type:'array',cellDates:true,raw:false,defval:''});
   const sheets=[];let chars=0;
   for(const name of wb.SheetNames){
    const sheet=wb.Sheets[name],range=sheet['!ref']&&XLSX.utils.decode_range(sheet['!ref']);
    if(range&&((range.e.r+1)*(range.e.c+1)>1000000))throw new Error('La hoja supera un millón de celdas.');
    const csv=XLSX.utils.sheet_to_csv(sheet);chars+=csv.length;if(chars>8*1024*1024)throw new Error('Libro demasiado grande para el índice.');
    sheets.push({name,csv,rows:XLSX.utils.sheet_to_json(sheet,{header:1,defval:''})});
   }
   self.postMessage({sheets,text:sheets.map(x=>`HOJA: ${x.name}\n${x.csv}`).join('\n\n')});
  }else throw new Error('Tipo de procesamiento no registrado.');
 }catch(e){self.postMessage({error:e.message||'Error de lectura de documento'})}
};
