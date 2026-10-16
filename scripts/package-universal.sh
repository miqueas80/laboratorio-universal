#!/usr/bin/env bash
# NEXUS-X Universal: explicit, history-free production distribution.
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ $# -eq 0 ]]; then output="NEXUS-X-Universal-distribucion.zip"; else output="$1"; fi
if [[ "$output" != "$(basename "$output")" || "$output" != *.zip ]]; then
  echo 'Output must be a simple .zip filename inside the repository.' >&2
  exit 1
fi
node --test tests/clean-distribution.test.mjs >/dev/null
node <<'NODE'
const assert=require('node:assert/strict'),fs=require('node:fs');
const inv=JSON.parse(fs.readFileSync('inventory.json','utf8'));
const docs=JSON.parse(fs.readFileSync('documents-manifest.json','utf8'));
const master=JSON.parse(fs.readFileSync('catalogo_maestro.json','utf8'));
assert.equal(inv.recordCount,0);
assert.deepEqual(inv.records,[]);
assert.deepEqual(docs.documents,[]);
assert.deepEqual(master.sheets.Hoja1.rows,[]);
const app=fs.readFileSync('app.js','utf8'),sw=fs.readFileSync('sw.js','utf8');
assert.equal(app.match(/const APP_VERSION='([^']+)'/)[1],sw.match(/const VERSION='([^']+)'/)[1]);
console.log('PASS Universal has no preloaded school data and its app/SW versions match');
NODE
set -- \
  .nojekyll README.md LICENSE \
  LICENSE-jsqr.txt LICENSE-jszip.md LICENSE-pdfjs.txt LICENSE-sheetjs.txt \
  index.html startup-fallback.js app.js config.js sw.js manifest.webmanifest \
  icon.svg icon-192.png icon-512.png \
  inventory.json catalogo_maestro.json documents-manifest.json \
  backup-verify.js backup-restore.js \
  document-worker.js jszip.min.js xlsx.full.min.js jsQR.js \
  pdf.mjs pdf.worker.mjs mascot offline
for item in "$@"; do
 if [[ ! -e "$item" ]]; then echo "Missing production asset: $item" >&2; exit 1; fi
done
rm -f "$output" "$output.sha256"
zip -X -qr "$output" "$@"
unzip -tqq "$output"
if unzip -Z -1 "$output" | grep -Ei '(^|/)(\.git|\.github|tests|scripts|node_modules)/|(^|/)(\.env|\.DS_Store)|\.(test|spec)\.(js|mjs)$'; then
 echo 'Unsafe archive: development files, secrets or Git history found.' >&2
 rm -f "$output"; exit 1
fi
for asset in index.html app.js sw.js backup-verify.js backup-restore.js inventory.json documents-manifest.json; do
 if ! unzip -Z -1 "$output" | grep -Fxq "$asset"; then
  echo "Missing archive member: $asset" >&2; rm -f "$output"; exit 1
 fi
done
sha256sum "$output" > "$output.sha256"
echo "PASS clean Universal ZIP: $(du -h "$output" | cut -f1)"
cat "$output.sha256"
