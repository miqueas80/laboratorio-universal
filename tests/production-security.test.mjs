import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('index.html'),sw=read('sw.js'),pack=read('scripts/package-universal.sh');
const csp=html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)?.[1]||'';

test('Production CSP permits only self-hosted JS, compatible with offline WASM',()=>{
 assert.match(csp,/(?:^|;\s*)default-src 'self'/);
 assert.match(csp,/(?:^|;\s*)script-src 'self' 'wasm-unsafe-eval'/);
 assert.doesNotMatch(csp,/script-src[^;]*'unsafe-inline'/);
 assert.doesNotMatch(csp,/script-src[^;]*'unsafe-eval'/);
 assert.match(csp,/object-src 'none'/);
 assert.match(csp,/base-uri 'self'/);
 assert.match(csp,/form-action 'none'/);
 assert.match(csp,/worker-src 'self' blob:/);
 assert.match(csp,/connect-src 'self' https:/);
 assert.doesNotMatch(html,/<script\b(?![^>]*\bsrc\s*=)[^>]*>[\s\S]*?<\/script>/i,
  'Every script must have an explicit local src and be independently cached');
});

test('Startup failsafe is a same-origin file cached atomically for offline startup',()=>{
 assert.match(html,/<script src="\.\/startup-fallback\.js"><\/script>/);
 assert.match(sw,/'\.\/startup-fallback\.js'/);
 assert.match(pack,/index\.html startup-fallback\.js app\.js/);
 assert.match(read('startup-fallback.js'),/window\.setTimeout\(release,9000\)/);
});

test('PWA app and Service Worker use the same release candidate identifier',()=>{
 const app=read('app.js');
 assert.equal(app.match(/const APP_VERSION='([^']+)'/)?.[1],
  sw.match(/const VERSION='([^']+)'/)?.[1]);
});

test('Production distribution rejects embedded JavaScript and Git history',()=>{
 assert.match(pack, /zip -X -qr/);
 assert.match(pack,/\.git/);
 assert.match(pack,/node --test tests\/clean-distribution\.test\.mjs/);
 assert.match(pack,/startup-fallback\.js/);
});
