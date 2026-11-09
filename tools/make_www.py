# One-time conversion of the Shelfmark page into the standalone Book Shelf app (www/index.html).
import re, sys, os
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
s=open(os.path.join(ROOT,'tools/base-from-shelfmark.html'),encoding='utf-8').read()
src=lambda n: open(os.path.join(ROOT,'src',n),encoding='utf-8').read()
def rep(a,b,cnt=1):
    global s
    n=s.count(a)
    if n!=cnt: raise SystemExit(f'expected {cnt} got {n}: {a[:100]!r}')
    s=s.replace(a,b)
def cut(start,end,new,include_end=False):
    global s
    i=s.index(start); j=s.index(end,i)
    if include_end: j+=len(end)
    s=s[:i]+new+s[j:]
# ---- document head, local fonts and libraries
head_end=s.index('<style>')
s=s[head_end:]
HEAD='''<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Book Shelf</title>
<link rel="stylesheet" href="lib/fonts/fonts.css">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}html,body{margin:0}body{font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>
</head><body>
'''
s=HEAD+s+'\n</body></html>\n'
rep('<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>\n<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"></script>\n<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>\n<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js"></script>',
    '<script src="lib/pdf.min.js"></script>\n<script src="lib/jszip.min.js"></script>\n<script src="lib/pdf-lib.min.js"></script>')
rep("pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'","pdfjsLib.GlobalWorkerOptions.workerSrc='lib/pdf.worker.min.js'")
rep("xlsx:['https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',","xlsx:['lib/xlsx.full.min.js',")
rep("mammoth:['https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js',","mammoth:['lib/mammoth.browser.min.js',")
rep("docxp:['https://cdn.jsdelivr.net/npm/docx-preview@0.3.2/dist/docx-preview.min.js',","docxp:['lib/docx-preview.min.js',")
s=s.replace('How to use Kitab Ghar','How to use Book Shelf').replace('Shelfmark','Book Shelf')
# ---- header: app menu button
rep('<button class="sync" id="syncBtn" data-s="off" aria-label="Sync status"><i></i><span id="syncTxt">Sync</span></button>',
    '<button class="sync" id="syncBtn" data-s="off" aria-label="Sync status"><i></i><span id="syncTxt">Sync</span></button>\n      <button class="ib" id="appMenuBtn" aria-label="Menu"><svg class="i"><use href="#i-more"/></svg></button>')
# ---- saving files
cut("async function saveBlobAs(filename,data){","async function saveFile(b){","async function saveBlobAs(filename,data){return BS.saveFile(filename,data)}\n")
cut("async function saveFile(b){","function enterReaderHistory()","""async function saveFile(b){
  const blob=await Store.getFile(b.id);if(!blob){toast('The file for this book is missing.');return}
  await BS.saveFile(safeName(b.title)+'.'+b.format,blob,mimeOf(b.format));
}
""")
# ---- add-books menu: device picker (includes Google Drive on Android)
cut("function addMenu(){","let mcpNS;","""function addMenu(){
  const b=sheet(`<h2>Add books</h2><p class="muted" style="margin:0">PDF, EPUB, Word, Excel or PowerPoint files.</p>
   <div class="menu">
    <div class="pickwrap" style="position:relative;display:flex;align-items:center;gap:14px;padding:12px;border-radius:12px;font-weight:500">
      <svg class="i"><use href="#i-file"/></svg><span>Choose files<small>${BS.platform==='android'?'From your phone, Downloads or Google Drive (tap ☰ in the picker to switch)':BS.platform==='windows'?'From your computer, including your Google Drive (G:) folder':'From this device'}</small></span>
      <input type="file" id="devPick" multiple aria-label="Choose files" style="position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;font-size:0">
    </div>
    <button data-a="img"><svg class="i"><use href="#i-file"/></svg><span>Pictures to PDF<small>Turn photos or scans into one PDF</small></span></button>
   </div>
   <div class="mact"><button class="btn" data-a="x">Close</button></div>`);
  $('#devPick').addEventListener('change',e=>{const fs=[...e.target.files];if(fs.length)importFiles(fs)});
  b.onclick=e=>{const a=e.target.closest('[data-a]');if(!a)return;if(a.dataset.a==='img'){closeSheet();imagesToPdf()}else closeSheet()};
}
""")
# ---- sync over GitHub
cut("const MAXUP=20*1024*1024;","let rsT=0;",src('sync-github.js')+'\n')
cut("$('#syncBtn').addEventListener('click',async()=>{","/* ================= shelf ================= */","$('#syncBtn').addEventListener('click',syncSheet);\n$('#appMenuBtn').addEventListener('click',appMenu);\n\n")
# ---- offline dictionary
cut("let dictCtl=null,sampleFn;","function contextAround(","let dictCtl=null;\n")
cut("async function lookUp(word,context){","/* ================= read aloud","""async function lookUp(word,context){
  word=String(word).replace(/^[^\\p{L}\\p{N}]+|[^\\p{L}\\p{N}]+$/gu,'').slice(0,80);if(!word)return;
  if(word.split(/\\s+/).length>5){toast('Select one word or a short phrase for the dictionary.');return}
  openDict();$('#dictQ').value=word;const B=$('#dictB');
  const h=LS.get('dicth',[]).filter(x=>x.toLowerCase()!==word.toLowerCase());h.unshift(word);LS.set('dicth',h.slice(0,12));
  B.innerHTML=`<p class="dw">${esc(word)}</p><p class="muted" style="color:var(--r-muted)">Looking it up…</p>`;
  try{renderDict(await dictLookup(word))}catch(e){console.warn(e);B.innerHTML=`<p class="dw">${esc(word)}</p><p class="muted" style="color:var(--r-muted)">The dictionary couldn’t be opened.</p>`}
}
function renderDict(r){
  const B=$('#dictB');if(!r)return;
  if(!r.hits.length){B.innerHTML=`<p class="dw">${esc(r.word)}</p><p class="muted" style="color:var(--r-muted)">This word isn’t in the dictionary.</p>${(r.suggest||[]).length?`<div class="dsyn">Did you mean ${r.suggest.map(x=>`<span data-w="${esc(x)}">${esc(x)}</span>`).join('')}</div>`:''}${dictHistory()}`;return}
  const first=r.hits[0];const pron=r.hits.flatMap(h=>h.entries).map(e=>e.r).find(Boolean);
  let html=`<p class="dw">${esc(first.entries[0].w||first.key)}</p>${pron?`<div class="dph">/${esc(pron)}/</div>`:''}`;
  if(first.key!==r.word)html+=`<div class="dctx"><b>Base form</b>“${esc(r.word)}” is a form of “${esc(first.key)}”</div>`;
  for(const h of r.hits){for(const e of h.entries){
    html+=`<div class="dpos">${esc(e.p)}${h.key!==first.key?` · ${esc(e.w)}`:''}</div><ol class="ddef">${e.s.slice(0,8).map(s=>`<li>${esc(s[0])}${(s[1]||[]).slice(0,2).map(x=>`<span class="dex">“${esc(x)}”</span>`).join('')}${(s[2]||[]).length?`<span class="dsyn" style="margin-top:4px;display:block">${s[2].slice(0,5).map(x=>`<span data-w="${esc(x)}">${esc(x)}</span>`).join('')}</span>`:''}</li>`).join('')}</ol>`}}
  html+=`<p class="muted" style="font-size:12px;margin-top:18px;color:var(--r-muted)">Offline dictionary: Open English WordNet.</p>${dictHistory()}`;
  B.innerHTML=html;B.scrollTop=0;
}
""")
# ---- PDF tools entries in menus
rep("""    <button data-m="annpdf"><svg class="i"><use href="#i-pen"/></svg><span>Save PDF with highlights<small>A copy with your highlights and drawings on the pages</small></span></button>""",
"""    <button data-m="tools"><svg class="i"><use href="#i-file"/></svg><span>PDF tools<small>Organise pages, merge, split, compress, watermark, forms, convert to Word…</small></span></button>
    <button data-m="annpdf"><svg class="i"><use href="#i-pen"/></svg><span>Save PDF with highlights<small>A copy with your highlights and drawings on the pages</small></span></button>""")
rep("    else if(m==='annpdf'){closeSheet();exportAnnotatedPdf(book)}","    else if(m==='annpdf'){closeSheet();exportAnnotatedPdf(book)}\n    else if(m==='tools'){pdfToolsMenu(book)}")
rep("""    <button data-m="save"><svg class="i"><use href="#i-down"/></svg><span>Save ${b.format.toUpperCase()} file</span></button>""",
"""    ${b.format==='pdf'&&!b.cloud?'<button data-m="tools"><svg class="i"><use href="#i-file"/></svg><span>PDF tools<small>Organise pages, merge, split, compress, convert…</small></span></button>':''}
    <button data-m="save"><svg class="i"><use href="#i-down"/></svg><span>Save ${b.format.toUpperCase()} file</span></button>""")
rep("    else if(m==='save'){closeSheet();saveFile(b)}","    else if(m==='save'){closeSheet();saveFile(b)}\n    else if(m==='tools'){pdfToolsMenu(b)}")
# ---- drawing tools: text, shapes, signature
rep('<div class="rw"><button data-tool="pen">Pen</button><button data-tool="marker">Marker</button><button data-tool="eraser">Eraser</button><button data-tool="note">Sticky note</button></div>',
    '<div class="rw"><button data-tool="pen">Pen</button><button data-tool="marker">Marker</button><button data-tool="text">Text</button><button data-tool="rect">Box</button><button data-tool="ellipse">Circle</button><button data-tool="arrow">Arrow</button><button data-tool="line">Line</button><button data-tool="sign">Sign</button><button data-tool="note">Note</button><button data-tool="eraser">Eraser</button></div>')
rep("""  $('#dcol').innerHTML=DR.tool==='eraser'||DR.tool==='note'?`<span class="muted" style="font-size:13px;color:var(--r-muted)">${DR.tool==='eraser'?'Tap or drag over a drawing or note to remove it':'Tap the page where the note should go'}</span>`:""",
"""  $('#dcol').innerHTML=DR.tool==='sign'?`<span class="muted" style="font-size:13px;color:var(--r-muted)">Tap the page where your signature should go</span><button data-sig="1">${LS.get('sig',null)?'Change signature':'Create signature'}</button>`:DR.tool==='eraser'||DR.tool==='note'?`<span class="muted" style="font-size:13px;color:var(--r-muted)">${DR.tool==='eraser'?'Tap or drag over anything you added to remove it':'Tap the page where the note should go'}</span>`:""")
rep("  $$('#drawbar [data-dw]').forEach(b=>{b.setAttribute('aria-pressed',String(Number(b.dataset.dw)===DR.w));b.hidden=DR.tool==='eraser'||DR.tool==='note'});",
    "  $$('#drawbar [data-dw]').forEach(b=>{b.setAttribute('aria-pressed',String(Number(b.dataset.dw)===DR.w));b.hidden=['eraser','note','sign'].includes(DR.tool);b.textContent=DR.tool==='text'?{2:'Small',4:'Medium',8:'Large'}[b.dataset.dw]:{2:'Thin',4:'Medium',8:'Thick'}[b.dataset.dw]});")
rep("  const t=e.target.closest('[data-tool]');if(t){DR.tool=t.dataset.tool;renderDrawbar();return}",
    "  const t=e.target.closest('[data-tool]');if(t){DR.tool=t.dataset.tool;renderDrawbar();return}\n  if(e.target.closest('[data-sig]')){signaturePad(()=>renderDrawbar());return}")
rep("""  if(DR.tool==='note'){const a={id:uid(),kind:'note',page:i+1,x:+pt[0].toFixed(4),y:+pt[1].toFixed(4),note:'',at:Date.now()};hlsOf(P.book).push(a);DR.undo.push(a.id);drawAnno(i);saveBook(P.book);openHlSheet(P.book,a,true);return}""",
"""  if(DR.tool==='note'){const a={id:uid(),kind:'note',page:i+1,x:+pt[0].toFixed(4),y:+pt[1].toFixed(4),note:'',at:Date.now()};hlsOf(P.book).push(a);DR.undo.push(a.id);drawAnno(i);saveBook(P.book);openHlSheet(P.book,a,true);return}
  if(DR.tool==='text'){const book=P.book;textAnnSheet({},v=>{if(!v)return;const a={id:uid(),kind:'text',page:i+1,x:+pt[0].toFixed(4),y:+pt[1].toFixed(4),text:v,color:INK[DR.color]||'#1F1F1F',size:TSZ[DR.w]||0.024,at:Date.now()};hlsOf(book).push(a);DR.undo.push(a.id);drawAnno(i);saveBook(book)});return}
  if(DR.tool==='sign'){const book=P.book;const asp0=P.sizes[i].h/P.sizes[i].w;const place=sig=>{const w=0.28,h=w*sig.ar/asp0;const a={id:uid(),kind:'img',page:i+1,x:+clamp(pt[0]-w/2,0,1-w).toFixed(4),y:+clamp(pt[1]-h/2,0,1-h).toFixed(4),w,h:+h.toFixed(4),src:sig.src,at:Date.now()};hlsOf(book).push(a);DR.undo.push(a.id);drawAnno(i);saveBook(book)};const sg=LS.get('sig',null);if(sg)place(sg);else signaturePad(place);return}
  if(['rect','ellipse','arrow','line'].includes(DR.tool)){try{el.setPointerCapture(e.pointerId)}catch(x){}const asp=P.sizes[i].h/P.sizes[i].w;const svg=el.querySelector('.anno svg')||(drawAnno(i),el.querySelector('.anno svg'));const g=document.createElementNS('http://www.w3.org/2000/svg','g');svg.appendChild(g);DR.stroke={i,el,shape:DR.tool,p0:pt,p1:pt,g,asp,col:INK[DR.color]||'#D93025',w:DR.w};return}""")
rep("""  if(s.erase){eraseAt(s.i,pt);return}
  const l=s.pts[s.pts.length-1];""","""  if(s.erase){eraseAt(s.i,pt);return}
  if(s.shape){s.p1=pt;s.g.innerHTML=shapeSvg({shape:s.shape,x1:s.p0[0],y1:s.p0[1],x2:pt[0],y2:pt[1],color:s.col,w:s.w},s.asp);return}
  const l=s.pts[s.pts.length-1];""")
rep("""  const s=DR.stroke;DR.stroke=null;if(!s||s.erase)return;""","""  const s=DR.stroke;DR.stroke=null;if(!s||s.erase)return;
  if(s.shape){s.g.remove();if(Math.hypot(s.p1[0]-s.p0[0],s.p1[1]-s.p0[1])<0.01)return;const a={id:uid(),kind:'shape',shape:s.shape,page:s.i+1,x1:+s.p0[0].toFixed(4),y1:+s.p0[1].toFixed(4),x2:+s.p1[0].toFixed(4),y2:+s.p1[1].toFixed(4),color:s.col,w:s.w,at:Date.now()};hlsOf(P.book).push(a);DR.undo.push(a.id);drawAnno(s.i);saveBook(P.book);return}""")
rep("""    if(a.kind==='note'&&a.page===pg)h+=`<button class="an" data-an="${a.id}" style="left:${a.x*100}%;top:${a.y*100}%" aria-label="Note">✎</button>`;
  }""","""    if(a.kind==='note'&&a.page===pg)h+=`<button class="an" data-an="${a.id}" style="left:${a.x*100}%;top:${a.y*100}%" aria-label="Note">✎</button>`;
    if(a.page===pg&&a.kind==='shape')svg+=shapeSvg(a,asp);
    if(a.page===pg&&a.kind==='text')h+=`<div class="atx" data-at="${a.id}" dir="auto" style="left:${a.x*100}%;top:${a.y*100}%;color:${a.color};font-size:${(a.size*el.offsetWidth).toFixed(1)}px">${esc(a.text)}</div>`;
    if(a.page===pg&&a.kind==='img')h+=`<img class="aim" alt="" src="${a.src}" style="left:${a.x*100}%;top:${a.y*100}%;width:${a.w*100}%;height:${a.h*100}%">`;
  }""")
rep("""    else if(a.kind==='note'&&Math.hypot(a.x-pt[0],(a.y-pt[1])*asp)<0.03){removeAnn(P.book,a,true);hit=true}}""",
"""    else if(a.kind==='note'&&Math.hypot(a.x-pt[0],(a.y-pt[1])*asp)<0.03){removeAnn(P.book,a,true);hit=true}
    else if(a.kind==='shape'&&pt[0]>=Math.min(a.x1,a.x2)-0.015&&pt[0]<=Math.max(a.x1,a.x2)+0.015&&pt[1]>=Math.min(a.y1,a.y2)-0.015&&pt[1]<=Math.max(a.y1,a.y2)+0.015){removeAnn(P.book,a,true);hit=true}
    else if(a.kind==='img'&&pt[0]>=a.x&&pt[0]<=a.x+a.w&&pt[1]>=a.y&&pt[1]<=a.y+a.h){removeAnn(P.book,a,true);hit=true}
    else if(a.kind==='text'&&pt[0]>=a.x-0.01&&pt[0]<=a.x+Math.min(0.9,a.text.length*a.size*0.6)&&pt[1]>=a.y-0.01&&pt[1]<=a.y+a.size*1.6*(a.text.split('\\n').length)/asp){removeAnn(P.book,a,true);hit=true}}""")
rep("""  const an=e.target.closest('[data-an]');if(an){""","""  const at=e.target.closest('[data-at]');if(at){const a=hlsOf(P.book).find(x=>x.id===at.dataset.at);if(a){const book=P.book;textAnnSheet(a,v=>{if(v===undefined)return;if(v===null||!v){removeAnn(book,a)}else{a.text=v;a.mt=Date.now();drawAnno(a.page-1)}saveBook(book)});return true}}
  const an=e.target.closest('[data-an]');if(an){""")
rep("  const anns=hlsOf(book).filter(a=>(a.rects&&!a.failed&&!a.pending)||a.kind==='ink'||a.kind==='note');","  const anns=hlsOf(book).filter(a=>(a.rects&&!a.failed&&!a.pending)||['ink','note','shape','text','img'].includes(a.kind));")
rep("""      else if(a.kind==='note'){const g=geo(a.page);if(!g)continue;const p=map(g,a.x,a.y);""","""      else if(['shape','text','img'].includes(a.kind)){try{await exportExtraAnn(doc,a,geo,map,col)}catch(x){console.warn(x)}}
      else if(a.kind==='note'){const g=geo(a.page);if(!g)continue;const p=map(g,a.x,a.y);""")
# ---- CSS for new parts
rep("@media (max-width:620px){\n  .brand h1",r""".atx{position:absolute;white-space:pre-wrap;line-height:1.25;pointer-events:auto;font-family:"Figtree","Noto Naskh Arabic",Arial,sans-serif;font-weight:600;cursor:pointer;max-width:90%}
.aim{position:absolute;pointer-events:none}
.orgv{position:fixed;inset:0;z-index:60;display:flex;flex-direction:column;background:var(--wall);color:var(--ink)}
.orgv .obar{background:var(--panel)}
.orgv .obar .btn{background:var(--panel-2);border-color:var(--line);color:var(--ink)}
.orgv .obar .btn.primary{background:var(--brass);color:var(--brass-ink)}
.orggrid{flex:1;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:14px;padding:16px max(16px,env(safe-area-inset-left,0px)) calc(env(safe-area-inset-bottom,0px) + 30px)}
.ocell{position:relative;border:2px solid transparent;border-radius:10px;background:transparent;padding:6px;display:flex;flex-direction:column;align-items:center;gap:6px}
.ocell.on{border-color:var(--brass);background:color-mix(in srgb,var(--brass) 12%,transparent)}
.othumb{display:block;width:100%;aspect-ratio:3/4;display:grid;place-items:center;transition:transform .2s}
.othumb canvas{max-width:100%;max-height:100%;box-shadow:0 1px 6px rgba(0,0,0,.25);background:#fff}
.oblank{width:75%;aspect-ratio:3/4;background:#fff;box-shadow:0 1px 6px rgba(0,0,0,.25);display:grid;place-items:center;color:#999;font-size:12px}
.onum{font-size:12px;color:var(--ink-2);font-variant-numeric:tabular-nums}
.orgtools{display:flex;gap:6px;flex-wrap:wrap;padding:8px max(8px,env(safe-area-inset-left,0px));background:var(--panel);border-top:1px solid var(--line)}
.orgtools button{min-height:36px;padding:0 12px;border-radius:999px;border:1px solid var(--line);background:var(--panel-2);color:var(--ink);font-weight:600;font-size:13px}
@media (max-width:620px){
  .brand h1""")
rep('<div class="scrim" id="scrim" hidden></div>','''<section class="orgv" id="orgView" hidden>
  <div class="obar" id="orgBar"><button class="ib" data-og="close" aria-label="Close"><svg class="i"><use href="#i-x"/></svg></button><div class="rtitle"><b id="orgTitle"></b><span id="orgCount"></span></div><button class="btn" data-og="all">Select all</button><button class="btn primary" data-og="save">Save as new PDF</button></div>
  <div class="orggrid" id="orgGrid"></div>
  <div class="orgtools" id="orgTools"><button data-og="rotL">↺ Rotate</button><button data-og="rotR">↻ Rotate</button><button data-og="up">← Earlier</button><button data-og="down">Later →</button><button data-og="del">Delete</button><button data-og="extract">Extract selected</button><button data-og="blank">+ Blank page</button></div>
</section>
<div class="scrim" id="scrim" hidden></div>''')
# ---- modules and boot
rep("/* ================= PDF → EPUB conversion ================= */",src('standalone.js')+'\n'+src('pdftools.js')+r'''
function shapeSvg(a,asp){const X=v=>(v*1000).toFixed(1),Y=v=>(v*1000*asp).toFixed(1);const st=`fill="none" stroke="${a.color}" stroke-width="${a.w}" stroke-linecap="round" stroke-linejoin="round"`;
  const x0=Math.min(a.x1,a.x2),x1=Math.max(a.x1,a.x2),y0=Math.min(a.y1,a.y2),y1=Math.max(a.y1,a.y2);
  if(a.shape==='rect')return `<rect x="${X(x0)}" y="${Y(y0)}" width="${X(x1-x0)}" height="${Y(y1-y0)}" ${st}/>`;
  if(a.shape==='ellipse')return `<ellipse cx="${X((x0+x1)/2)}" cy="${Y((y0+y1)/2)}" rx="${X((x1-x0)/2)}" ry="${Y((y1-y0)/2)}" ${st}/>`;
  let out=`<line x1="${X(a.x1)}" y1="${Y(a.y1)}" x2="${X(a.x2)}" y2="${Y(a.y2)}" ${st}/>`;
  if(a.shape==='arrow'){const ex=a.x2*1000,ey=a.y2*1000*asp,ang=Math.atan2(ey-a.y1*1000*asp,ex-a.x1*1000),L=Math.max(14,a.w*4);out+=`<polyline points="${(ex+L*Math.cos(ang+2.6)).toFixed(1)},${(ey+L*Math.sin(ang+2.6)).toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)} ${(ex+L*Math.cos(ang-2.6)).toFixed(1)},${(ey+L*Math.sin(ang-2.6)).toFixed(1)}" ${st}/>`}
  return out}
/* ================= PDF → EPUB conversion ================= */''')
rep("  Sync.start();","  Sync.start();\n  BS.init().then(()=>{BS.takeIncoming();if(Date.now()-LS.get('updChecked',0)>12*3600e3)setTimeout(()=>Upd.check(true),5000)});")
s=s.replace(' If this keeps happening, tell Claude what this message says.','')
s=s.replace('Books are kept privately in this browser on this device. Add the same file on your phone to read it there too.','Books are kept privately on this device. Turn on sync (⋯ → Sync between devices) to see them on your phone and computer.')
s=s.replace('.drawbar .rw{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;align-items:center}','.drawbar .rw{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;align-items:center}\n.drawbar .rw:first-child{flex-wrap:nowrap;overflow-x:auto;justify-content:flex-start;max-width:min(560px,calc(100vw - 48px));padding-bottom:2px}\n.drawbar .rw:first-child button{flex:none}')
open(os.path.join(ROOT,'www/index.html'),'w',encoding='utf-8').write(s)
print('www/index.html written', len(s))
