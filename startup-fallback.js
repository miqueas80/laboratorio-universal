/* Startup failsafe is deliberately separate for strict script-src 'self' CSP. */
/* Fallback independiente del módulo; evita pantalla bloqueada ante un fallo de red. */
(function(){
  var splash=document.getElementById('nexus-boot-splash');
  function release(){
    if(splash&&splash.isConnected)splash.remove();
    var app=document.querySelector('.app');
    if(app)app.removeAttribute('inert');
  }
  var skip=document.getElementById('nexus-boot-skip');
  if(skip)skip.addEventListener('click',release);
  window.setTimeout(release,9000);
})();
