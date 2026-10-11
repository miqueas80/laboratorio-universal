/* Per-browser pilot identity: never reuse the school or app namespaces from earlier demos. */
(function(root){
'use strict';
const scope=encodeURIComponent(new URL('./',root.location.href).pathname);
const KEY='nexus-mesh:two-devices:role:'+scope;
const ROLES=Object.freeze({
 a:Object.freeze({id:'ws-aaaaaaaa-0000-4000-8000-000000000101',name:'Escuela A (demo)'}),
 b:Object.freeze({id:'ws-bbbbbbbb-0000-4000-8000-000000000202',name:'Escuela B (demo)'}),
 c:Object.freeze({id:'ws-cccccccc-0000-4000-8000-000000000303',name:'Escuela C (demo)'})
});
let current;
try{current=root.localStorage.getItem(KEY)||'';}catch{current='';}
if(!Object.hasOwn(ROLES,current))current='';
const workspace=ROLES[current]||null;
root.NexusWorkspaces=Object.freeze({
 activeId:workspace?.id||'personal',
 active:()=>workspace?{...workspace}:{id:'personal',name:'Sin escuela de prueba'}
});
function choose(role){
 if(!Object.hasOwn(ROLES,role))throw Error('Seleccioná una escuela de prueba válida.');
 root.localStorage.setItem(KEY,role);
 root.location.reload();
}
root.NexusPilotRole=Object.freeze({current,ROLES,choose});
})(globalThis);
