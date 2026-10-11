/* One offline standalone HTML for testing two independent phones.
 * All scripts are directly from the experimental NEXUS Mesh branch.
 */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..');
const read=path=>readFileSync(resolve(root,path),'utf8');
const startMarker='<!-- BEGIN_NEXUS_PILOT_SCRIPTS -->';
const endMarker='<!-- END_NEXUS_PILOT_SCRIPTS -->';
const html=read('pilot/index.html'),start=html.indexOf(startMarker),end=html.indexOf(endMarker,start);
assert(start>=0&&end>start&&html.split(startMarker).length===2&&html.split(endMarker).length===2);
const sources=['pilot/bootstrap.js','mesh/core.js','mesh/local.js','mesh/registry.js','pilot/device.js'];
const code=sources.map(path=>'<script>\n'+read(path).replace(/<\/script/gi,'<\\/script')+'\n</script>').join('\n');
const output=html.slice(0,start)+code+html.slice(end+endMarker.length);
assert(!/<script\b[^>]*src\s*=/i.test(output),'La prueba no admite dependencias de scripts externos.');
assert(!/fetch\s*\(/.test(read('pilot/device.js')),'La prueba no debe usar tráfico de red.');
assert(output.length<220000,'La demo excede el presupuesto máximo (220 KiB).');
assert(output.includes('searchVerified')&&output.includes('NexusMeshLocal'));
mkdirSync(resolve(root,'dist'),{recursive:true});
const file=resolve(root,'dist/MALLA-FEDERAL-DOS-CELULARES.html');
writeFileSync(file,output);
console.log('Piloto offline generado:',file,'(',new TextEncoder().encode(output).length,'bytes)');
