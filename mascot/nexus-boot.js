/* NEXUS-X · Intro que abre el dashboard: saludo + vuelo + revelado progresivo.
   No ejecuta acciones, voz ni cambia de vista. */
(function(){
'use strict';
function startBoot(){
  var splash=document.getElementById('nexus-boot-splash');
  if(!splash)return;
  var timers=[],finished=false;
  function later(fn,delay){
    timers.push(window.setTimeout(function(){if(!finished&&splash.isConnected)fn()},delay));
  }
  function finish(){
    if(finished)return;
    finished=true;
    timers.forEach(window.clearTimeout);
    splash.dataset.phase='done';
    splash.remove();
    var app=document.querySelector('.app');
    if(app)app.removeAttribute('inert');
    document.documentElement.dataset.nexusBoot='complete';
  }
  var skip=document.getElementById('nexus-boot-skip');
  if(skip)skip.addEventListener('click',finish);
  if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches){
    later(finish,1000);
    return;
  }
  // La pantalla empieza con el robot grande, que sonríe y saluda.
  // Al volar, la cortina se retira con su trayectoria y revela la app habitual.
  later(function(){splash.dataset.phase='flight';document.documentElement.dataset.nexusBoot='flight'},1850);
  later(finish,4450);
  document.addEventListener('visibilitychange',function(){
    if(document.hidden&&splash.isConnected)finish();
  },{once:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startBoot,{once:true});
else startBoot();
})();
