// Copies the reading libraries and fonts from node_modules into www/lib so the app works fully offline.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const nm = p => path.join(root, 'node_modules', p);
const lib = path.join(root, 'www', 'lib');
fs.rmSync(lib, { recursive: true, force: true });
fs.mkdirSync(path.join(lib, 'fonts'), { recursive: true });
let failed = false;
function copyFirst(dest, candidates) {
  const hit = candidates.map(nm).find(f => fs.existsSync(f));
  if (!hit) { console.error('MISSING: ' + dest + ' (looked for ' + candidates.join(', ') + ')'); failed = true; return; }
  fs.copyFileSync(hit, path.join(lib, dest));
  console.log('lib/' + dest + '  <-  ' + path.relative(root, hit));
}
// Capacitor's own script, so the Android app can reach its native parts (optional elsewhere)
{ const f = ['@capacitor/core/dist/capacitor.js'].map(nm).find(x => fs.existsSync(x)); if (f) { fs.copyFileSync(f, path.join(lib, 'capacitor.js')); console.log('lib/capacitor.js'); } else { fs.writeFileSync(path.join(lib, 'capacitor.js'), ''); console.warn('capacitor.js not found; using the built-in bridge'); } }
copyFirst('pdf.min.js', ['pdfjs-dist/build/pdf.min.js', 'pdfjs-dist/build/pdf.js']);
copyFirst('pdf.worker.min.js', ['pdfjs-dist/build/pdf.worker.min.js', 'pdfjs-dist/build/pdf.worker.js']);
copyFirst('jszip.min.js', ['jszip/dist/jszip.min.js']);
copyFirst('pdf-lib.min.js', ['pdf-lib/dist/pdf-lib.min.js']);
copyFirst('xlsx.full.min.js', ['xlsx/dist/xlsx.full.min.js']);
copyFirst('mammoth.browser.min.js', ['mammoth/mammoth.browser.min.js', 'mammoth/mammoth.browser.js']);
copyFirst('docx-preview.min.js', ['docx-preview/dist/docx-preview.min.js', 'docx-preview/dist/docx-preview.js']);

const fonts = {
  'young-serif': ['400'], figtree: ['400', '500', '600', '700'], literata: ['400', '600', '400-italic'],
  'source-serif-4': ['400', '600', '400-italic'], 'atkinson-hyperlegible': ['400', '700', '400-italic'],
  'noto-naskh-arabic': ['400', '600'], 'noto-nastaliq-urdu': ['400', '600']
};
let css = '';
for (const [name, weights] of Object.entries(fonts)) {
  const dir = nm('@fontsource/' + name);
  if (!fs.existsSync(dir)) { console.error('MISSING font: ' + name); failed = true; continue; }
  const out = path.join(lib, 'fonts', name);
  fs.cpSync(path.join(dir, 'files'), path.join(out, 'files'), { recursive: true });
  for (const w of weights) {
    const f = path.join(dir, w + '.css');
    if (fs.existsSync(f)) { fs.copyFileSync(f, path.join(out, w + '.css')); css += `@import url("${name}/${w}.css");\n`; }
    else console.warn('font weight not found, skipped: ' + name + ' ' + w);
  }
}
fs.writeFileSync(path.join(lib, 'fonts', 'fonts.css'), css);
if (!fs.existsSync(path.join(root, 'www', 'dict', 'a.json'))) { console.error('MISSING: dictionary files in www/dict'); failed = true; }
if (failed) { console.error('Some files are missing, so the build stops here.'); process.exit(1); }
console.log('All libraries and fonts copied.');
