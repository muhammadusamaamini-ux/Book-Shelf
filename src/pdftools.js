
/* ================= PDF tools (PDFgear-style) ================= */
function parseRanges(str,n){const out=[];for(const part of String(str).split(/[,;\s]+/)){if(!part)continue;const m=part.match(/^(\d+)(?:\s*[-–]\s*(\d+|end))?$/i);if(!m)return null;let a=Number(m[1]),b=m[2]?(m[2].toLowerCase()==='end'?n:Number(m[2])):a;if(a<1||b>n||a>b)return null;for(let i=a;i<=b;i++)out.push(i-1)}return out}
async function pdfBytesOf(book){const f=await Store.getFile(book.id);if(!f)throw new Error('The file for this PDF is missing');return new Uint8Array(await f.arrayBuffer())}
async function addPdfToShelf(bytes,name,open){
  const before=new Set(books.map(b=>b.id));await importFiles([new File([bytes],safeName(name)+'.pdf',{type:'application/pdf'})]);
  const nb=books.find(b=>!before.has(b.id));
  if(nb){toast(`Saved to your shelf as “${nb.title}”`,{label:'Open',fn:()=>openBook(nb)});if(open)openBook(nb)}
  return nb;
}
function toolBusy(title){return sheet(`<h2>${esc(title)}</h2><p class="muted stat" id="bsub">Working…</p><div class="pbar"><i id="bbar" style="width:3%"></i></div>`)}
function toolErr(e){console.error(e);sheet(`<h2>That didn’t work</h2><p class="muted">${esc(e&&e.message||'This PDF couldn’t be changed. It may be protected with a password.')}</p><div class="mact"><button class="btn primary" data-a="x">OK</button></div>`).onclick=ev=>{if(ev.target.closest('[data-a]'))closeSheet()}}
async function loadLibDoc(bytes){return PDFLib.PDFDocument.load(bytes,{ignoreEncryption:true})}

function pdfToolsMenu(book){
  const items=[
    ['organize','Organise pages','Reorder, rotate, delete, extract or add blank pages'],
    ['extract','Extract or split pages','Make a new PDF from chosen pages, or split into parts'],
    ['merge','Merge with other PDFs','Join PDFs from your shelf into one'],
    ['compress','Compress','Make the file smaller'],
    ['watermark','Add a watermark','Text across every page'],
    ['numbers','Add page numbers',''],
    ['form','Fill in a form','For PDFs with fillable fields'],
    ['toword','Convert to Word (.docx)','Editable text, headings and paragraphs'],
    ['totext','Convert to plain text (.txt)',''],
    ['toimg','Save pages as pictures','PNG pictures in a .zip file'],
    ['annpdf','Save with highlights and drawings','A copy other PDF apps can open'],
    ['epub','Convert to EPUB','Adjustable text for comfortable reading']];
  const b=sheet(`<h2>PDF tools</h2><p class="muted" style="margin:0">${esc(book.title)}</p><div class="menu">${items.map(([k,t,s])=>`<button data-t="${k}"><svg class="i"><use href="#i-file"/></svg><span>${t}${s?`<small>${s}</small>`:''}</span></button>`).join('')}</div><div class="mact"><button class="btn" data-a="x">Close</button></div>`);
  b.onclick=e=>{const t=e.target.closest('[data-t]');if(!t){if(e.target.closest('[data-a]'))closeSheet();return}const k=t.dataset.t;
    ({organize:()=>{closeSheet();organizePages(book)},extract:()=>extractSheet(book),merge:()=>mergeSheet([book.id]),compress:()=>compressSheet(book),watermark:()=>watermarkSheet(book),numbers:()=>numbersSheet(book),
      form:()=>formSheet(book),toword:()=>pdfToWord(book),totext:()=>pdfToText(book),toimg:()=>pdfToImages(book),annpdf:()=>{closeSheet();exportAnnotatedPdf(book)},epub:()=>openConvert(book)})[k]()};
}
function shelfPdfTools(){
  const b=sheet(`<h2>PDF tools</h2><div class="menu">
    <button data-t="merge"><svg class="i"><use href="#i-file"/></svg><span>Merge PDFs<small>Join PDFs from your shelf into one</small></span></button>
    <button data-t="img"><svg class="i"><use href="#i-file"/></svg><span>Pictures to PDF<small>Turn photos or scans into one PDF</small></span></button>
    <p class="muted" style="font-size:13px;padding:6px 12px">For one PDF’s tools (organise pages, compress, convert…), open its ⋯ menu on the shelf or in the reader.</p>
  </div><div class="mact"><button class="btn" data-a="x">Close</button></div>`);
  b.onclick=e=>{const t=e.target.closest('[data-t]');if(!t){if(e.target.closest('[data-a]'))closeSheet();return}if(t.dataset.t==='merge')mergeSheet([]);else imagesToPdf()};
}

/* --- organise pages --- */
const ORG={book:null,doc:null,items:[],sel:new Set()};
async function organizePages(book){
  const ov=$('#orgView');ov.hidden=false;ORG.book=book;ORG.sel=new Set();$('#orgTitle').textContent=book.title;$('#orgGrid').innerHTML='<p class="oload">Loading pages…</p>';
  try{const bytes=await pdfBytesOf(book);ORG.bytes=bytes;ORG.doc=await loadPdf(bytes.slice(0));
    ORG.items=Array.from({length:ORG.doc.numPages},(_,i)=>({src:i,rot:0,id:uid()}));orgRender()}catch(e){ov.hidden=true;toolErr(e)}
}
function orgRender(){
  const g=$('#orgGrid');g.innerHTML=ORG.items.map((it,k)=>`<button class="ocell${ORG.sel.has(it.id)?' on':''}" data-oi="${it.id}"><span class="othumb" style="transform:rotate(${it.rot}deg)">${it.blank?'<span class="oblank">Blank</span>':`<canvas data-src="${it.src}"></canvas>`}</span><span class="onum">${k+1}</span></button>`).join('');
  $('#orgCount').textContent=ORG.sel.size?`${ORG.sel.size} selected`:`${ORG.items.length} pages · tap to select`;
  const io=new IntersectionObserver(async es=>{for(const e of es){if(!e.isIntersecting)continue;io.unobserve(e.target);const c=e.target;try{const pg=await ORG.doc.getPage(Number(c.dataset.src)+1);const v1=pg.getViewport({scale:1});const vp=pg.getViewport({scale:150/v1.width});c.width=vp.width;c.height=vp.height;const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);await pg.render({canvasContext:ctx,viewport:vp}).promise}catch(x){}}},{root:g,rootMargin:'300px'});
  g.querySelectorAll('canvas').forEach(c=>io.observe(c));
}
$('#orgGrid').addEventListener('click',e=>{const c=e.target.closest('[data-oi]');if(!c)return;const id=c.dataset.oi;if(ORG.sel.has(id))ORG.sel.delete(id);else ORG.sel.add(id);c.classList.toggle('on');$('#orgCount').textContent=ORG.sel.size?`${ORG.sel.size} selected`:`${ORG.items.length} pages · tap to select`});
$('#orgView').addEventListener('click',async e=>{const b=e.target.closest('[data-og]');if(!b)return;const a=b.dataset.og;const sel=ORG.items.filter(x=>ORG.sel.has(x.id));
  if(a==='close'){$('#orgView').hidden=true;try{ORG.doc&&ORG.doc.destroy()}catch(x){}return}
  if(a==='all'){if(ORG.sel.size===ORG.items.length)ORG.sel.clear();else ORG.items.forEach(x=>ORG.sel.add(x.id));orgRender();return}
  if(a==='save'){await orgSave(ORG.items,' (edited)');return}
  if(!sel.length&&a!=='blank'){toast('Tap pages to select them first');return}
  if(a==='rotL'||a==='rotR'){sel.forEach(x=>x.rot=(x.rot+(a==='rotR'?90:270))%360)}
  else if(a==='del'){if(sel.length===ORG.items.length){toast('A PDF needs at least one page');return}ORG.items=ORG.items.filter(x=>!ORG.sel.has(x.id));ORG.sel.clear()}
  else if(a==='up'||a==='down'){const arr=ORG.items;if(a==='up'){for(let i=1;i<arr.length;i++)if(ORG.sel.has(arr[i].id)&&!ORG.sel.has(arr[i-1].id))[arr[i-1],arr[i]]=[arr[i],arr[i-1]]}else{for(let i=arr.length-2;i>=0;i--)if(ORG.sel.has(arr[i].id)&&!ORG.sel.has(arr[i+1].id))[arr[i+1],arr[i]]=[arr[i],arr[i+1]]}}
  else if(a==='blank'){const last=sel.length?ORG.items.indexOf(sel[sel.length-1]):ORG.items.length-1;ORG.items.splice(last+1,0,{blank:true,src:ORG.items[Math.max(0,last)].src,rot:0,id:uid()})}
  else if(a==='extract'){await orgSave(sel,' (pages)');return}
  orgRender();
});
async function orgSave(items,suffix){
  toolBusy('Saving the PDF');
  try{const src=await loadLibDoc(ORG.bytes);const out=await PDFLib.PDFDocument.create();
    for(let k=0;k<items.length;k++){const it=items[k];
      if(it.blank){const ref=src.getPage(it.src);const {width,height}=ref.getSize();out.addPage([width,height])}
      else{const [p]=await out.copyPages(src,[it.src]);const base=p.getRotation().angle||0;p.setRotation(PDFLib.degrees((base+it.rot)%360));out.addPage(p)}
      if(k%10===0)setBusy(`Page ${k+1} of ${items.length}`,k/items.length)}
    const bytes=await out.save();closeSheet();$('#orgView').hidden=true;await addPdfToShelf(bytes,ORG.book.title+suffix);
  }catch(e){toolErr(e)}
}

/* --- extract / split --- */
function extractSheet(book){
  const n=book.pages||0;
  const b=sheet(`<h2>Extract or split pages</h2><p class="muted" style="margin:0">${esc(book.title)} · ${n} pages</p>
    <label class="f" for="exR">Pages to extract<input type="text" id="exR" placeholder="e.g. 1-3, 7, 10-end" autocomplete="off"></label>
    <div class="mact" style="justify-content:flex-start"><button class="btn primary" data-a="ex">Extract to a new PDF</button></div>
    <label class="f" for="spN">Or split into parts of this many pages<input type="text" id="spN" inputmode="numeric" placeholder="e.g. 10"></label>
    <div class="mact" style="justify-content:flex-start"><button class="btn" data-a="sp">Split</button></div>
    <div class="mact"><button class="btn" data-a="x">Close</button></div>`);
  b.onclick=async e=>{const a=e.target.closest('[data-a]');if(!a)return;if(a.dataset.a==='x'){closeSheet();return}
    try{const bytes=await pdfBytesOf(book);const src=await loadLibDoc(bytes);const N=src.getPageCount();
      if(a.dataset.a==='ex'){const idx=parseRanges($('#exR').value,N);if(!idx||!idx.length){toast('Type pages like 1-3, 7, 10-end');return}
        toolBusy('Extracting pages');const out=await PDFLib.PDFDocument.create();(await out.copyPages(src,idx)).forEach(p=>out.addPage(p));const r=await out.save();closeSheet();await addPdfToShelf(r,`${book.title} (pages ${$('#exR').value||''})`.slice(0,110))}
      else{const per=parseInt($('#spN').value,10);if(!(per>=1&&per<N)){toast('Type a number smaller than the page count');return}
        toolBusy('Splitting');for(let s=0,part=1;s<N;s+=per,part++){const out=await PDFLib.PDFDocument.create();const idx=[];for(let i=s;i<Math.min(N,s+per);i++)idx.push(i);(await out.copyPages(src,idx)).forEach(p=>out.addPage(p));setBusy(`Part ${part}`,s/N);
          await addPdfToShelf(await out.save(),`${book.title} (part ${part})`)}closeSheet()}
    }catch(x){toolErr(x)}};
}
/* --- merge --- */
function mergeSheet(pre){
  const pdfs=books.filter(b=>b.format==='pdf'&&!b.cloud);const order=[...pre];
  if(pdfs.length<2){toast('Add at least two PDFs to your shelf first');return}
  const draw=()=>{b.querySelector('#mgList').innerHTML=pdfs.map(p=>{const n=order.indexOf(p.id);return `<button data-mg="${p.id}"><span class="k" style="background:${n>=0?'var(--brass)':'var(--line)'};color:#fff">${n>=0?n+1:''}</span><span class="t"><b dir="auto">${esc(p.title)}</b><small>${p.pages||'?'} pages</small></span></button>`}).join('');b.querySelector('#mgGo').textContent=order.length>1?`Merge ${order.length} PDFs`:'Merge';b.querySelector('#mgGo').disabled=order.length<2};
  const b=sheet(`<h2>Merge PDFs</h2><p class="muted" style="margin:0">Tap PDFs in the order you want them joined.</p><div class="gdl" id="mgList"></div><div class="mact"><button class="btn" data-a="x">Cancel</button><button class="btn primary" id="mgGo" data-a="go">Merge</button></div>`);draw();
  b.onclick=async e=>{const m=e.target.closest('[data-mg]');if(m){const id=m.dataset.mg;const i=order.indexOf(id);if(i>=0)order.splice(i,1);else order.push(id);draw();return}
    const a=e.target.closest('[data-a]');if(!a)return;if(a.dataset.a==='x'){closeSheet();return}if(order.length<2)return;
    toolBusy('Merging PDFs');try{const out=await PDFLib.PDFDocument.create();
      for(let k=0;k<order.length;k++){const bk=byId(order[k]);setBusy(`Adding “${bk.title}”`,k/order.length);const src=await loadLibDoc(await pdfBytesOf(bk));(await out.copyPages(src,src.getPageIndices())).forEach(p=>out.addPage(p))}
      const r=await out.save();closeSheet();await addPdfToShelf(r,byId(order[0]).title+' (merged)')}catch(x){toolErr(x)}};
}
/* --- pictures to PDF --- */
function imagesToPdf(){
  const inp=document.createElement('input');inp.type='file';inp.accept='image/*';inp.multiple=true;
  inp.onchange=async()=>{const fs=[...inp.files];if(!fs.length)return;toolBusy('Making a PDF from pictures');
    try{const out=await PDFLib.PDFDocument.create();
      for(let k=0;k<fs.length;k++){setBusy(`Picture ${k+1} of ${fs.length}`,k/fs.length);const f=fs[k];let bytes=new Uint8Array(await f.arrayBuffer());let img;
        if(/png/i.test(f.type))img=await out.embedPng(bytes);else if(/jpe?g/i.test(f.type))img=await out.embedJpg(bytes);
        else{const bmp=await createImageBitmap(f);const c=document.createElement('canvas');c.width=bmp.width;c.height=bmp.height;c.getContext('2d').drawImage(bmp,0,0);img=await out.embedJpg(new Uint8Array(await (await new Promise(r=>c.toBlob(r,'image/jpeg',.9))).arrayBuffer()))}
        const W=595,s=W/img.width,H=img.height*s;const pg=out.addPage([W,H]);pg.drawImage(img,{x:0,y:0,width:W,height:H})}
      const r=await out.save();closeSheet();await addPdfToShelf(r,(fs[0].name||'Pictures').replace(/\.[^.]+$/,'')+(fs.length>1?' and more':''))}catch(x){toolErr(x)}};
  inp.click();
}
/* --- compress --- */
function compressSheet(book){
  const b=sheet(`<h2>Compress</h2><p class="muted">Pages are turned into pictures at a lower quality, so the file gets smaller. Text in the new copy can’t be selected or searched. The original stays on your shelf.</p>
    <div class="seg" id="cmpQ"><button data-v="low">Smallest</button><button data-v="med" aria-pressed="true">Balanced</button><button data-v="high">Best quality</button></div>
    <div class="mact"><button class="btn" data-a="x">Cancel</button><button class="btn primary" data-a="go">Compress</button></div>`);
  b.onclick=async e=>{const q=e.target.closest('#cmpQ button');if(q){$$('#cmpQ button').forEach(x=>x.setAttribute('aria-pressed',String(x===q)));return}
    const a=e.target.closest('[data-a]');if(!a)return;if(a.dataset.a==='x'){closeSheet();return}
    const lvl=($('#cmpQ [aria-pressed="true"]')||{}).dataset?.v||'med';const dpi={low:72,med:110,high:150}[lvl],qual={low:.5,med:.65,high:.8}[lvl];
    toolBusy('Compressing');try{const bytes=await pdfBytesOf(book);const doc=await loadPdf(bytes.slice(0));const out=await PDFLib.PDFDocument.create();
      for(let i=1;i<=doc.numPages;i++){setBusy(`Page ${i} of ${doc.numPages}`,i/doc.numPages);const pg=await doc.getPage(i);const v1=pg.getViewport({scale:1});const vp=pg.getViewport({scale:dpi/72});
        const c=document.createElement('canvas');c.width=Math.round(vp.width);c.height=Math.round(vp.height);const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);await pg.render({canvasContext:ctx,viewport:vp}).promise;
        const jb=new Uint8Array(await (await new Promise(r=>c.toBlob(r,'image/jpeg',qual))).arrayBuffer());c.width=0;const img=await out.embedJpg(jb);const p=out.addPage([v1.width,v1.height]);p.drawImage(img,{x:0,y:0,width:v1.width,height:v1.height});pg.cleanup()}
      doc.destroy();const r=await out.save();closeSheet();
      if(r.byteLength>=bytes.byteLength*0.95){sheet(`<h2>Already small</h2><p class="muted">Compressing would make this PDF ${fmtSize(r.byteLength)}, which isn’t smaller than now (${fmtSize(bytes.byteLength)}). Nothing was changed.</p><div class="mact"><button class="btn primary" data-a="x">OK</button></div>`).onclick=ev=>{if(ev.target.closest('[data-a]'))closeSheet()};return}
      await addPdfToShelf(r,book.title+' (compressed)');toast(`${fmtSize(bytes.byteLength)} → ${fmtSize(r.byteLength)}`)}catch(x){toolErr(x)}};
}
/* --- watermark & page numbers --- */
async function textImage(text,px,color){const c=document.createElement('canvas');const ctx=c.getContext('2d');const font=`700 ${px}px "Figtree","Noto Naskh Arabic",Arial,sans-serif`;ctx.font=font;const w=Math.ceil(ctx.measureText(text).width)+8;c.width=w;c.height=Math.ceil(px*1.5);const x=c.getContext('2d');x.font=font;x.fillStyle=color;x.textBaseline='middle';x.direction=RTL_RE.test(text)?'rtl':'ltr';x.textAlign=RTL_RE.test(text)?'right':'left';x.fillText(text,RTL_RE.test(text)?w-4:4,c.height/2);return new Uint8Array(await (await new Promise(r=>c.toBlob(r,'image/png'))).arrayBuffer())}
function watermarkSheet(book){
  const b=sheet(`<h2>Add a watermark</h2><label class="f" for="wmT">Text<input type="text" id="wmT" value="CONFIDENTIAL" dir="auto"></label>
    <label class="f">Look</label><div class="seg" id="wmS"><button data-v="diag" aria-pressed="true">Diagonal</button><button data-v="flat">Straight</button></div>
    <div class="seg" id="wmO"><button data-v=".12">Light</button><button data-v=".22" aria-pressed="true">Medium</button><button data-v=".4">Strong</button></div>
    <div class="mact"><button class="btn" data-a="x">Cancel</button><button class="btn primary" data-a="go">Add watermark</button></div>`);
  b.onclick=async e=>{const s=e.target.closest('.seg button');if(s){$$('button',s.parentElement).forEach(x=>x.setAttribute('aria-pressed',String(x===s)));return}
    const a=e.target.closest('[data-a]');if(!a)return;if(a.dataset.a==='x'){closeSheet();return}
    const txt=$('#wmT').value.trim();if(!txt){toast('Type the watermark text');return}const diag=$('#wmS [aria-pressed="true"]').dataset.v==='diag';const op=Number($('#wmO [aria-pressed="true"]').dataset.v);
    toolBusy('Adding the watermark');try{const doc=await loadLibDoc(await pdfBytesOf(book));const png=await doc.embedPng(await textImage(txt,120,'#555'));
      doc.getPages().forEach((p,k)=>{const {width,height}=p.getSize();const w=Math.min(width,height)*0.8,h=w*png.height/png.width;const ang=diag?Math.atan2(height,width):0;
        const cx=width/2,cy=height/2;const x=cx-(w/2)*Math.cos(ang)+(h/2)*Math.sin(ang),y=cy-(w/2)*Math.sin(ang)-(h/2)*Math.cos(ang);
        p.drawImage(png,{x,y,width:w,height:h,rotate:PDFLib.degrees(ang*180/Math.PI),opacity:op})});
      const r=await doc.save();closeSheet();await addPdfToShelf(r,book.title+' (watermarked)')}catch(x){toolErr(x)}};
}
function numbersSheet(book){
  const b=sheet(`<h2>Add page numbers</h2><label class="f">Where</label><div class="seg" id="pnP"><button data-v="bc" aria-pressed="true">Bottom middle</button><button data-v="br">Bottom right</button><button data-v="tr">Top right</button></div>
    <label class="f">Style</label><div class="seg" id="pnF"><button data-v="n" aria-pressed="true">1</button><button data-v="p">Page 1</button><button data-v="pn">Page 1 of 20</button></div>
    <label class="f" for="pnS">Start at<input type="text" id="pnS" inputmode="numeric" value="1"></label>
    <div class="mact"><button class="btn" data-a="x">Cancel</button><button class="btn primary" data-a="go">Add numbers</button></div>`);
  b.onclick=async e=>{const s=e.target.closest('.seg button');if(s){$$('button',s.parentElement).forEach(x=>x.setAttribute('aria-pressed',String(x===s)));return}
    const a=e.target.closest('[data-a]');if(!a)return;if(a.dataset.a==='x'){closeSheet();return}
    const pos=$('#pnP [aria-pressed="true"]').dataset.v,fmt=$('#pnF [aria-pressed="true"]').dataset.v,st=parseInt($('#pnS').value,10)||1;
    toolBusy('Adding page numbers');try{const doc=await loadLibDoc(await pdfBytesOf(book));const font=await doc.embedFont(PDFLib.StandardFonts.Helvetica);const pages=doc.getPages();const N=pages.length+st-1;
      pages.forEach((p,k)=>{const n=k+st;const t=fmt==='n'?String(n):fmt==='p'?`Page ${n}`:`Page ${n} of ${N}`;const {width,height}=p.getSize();const sz=Math.max(8,Math.min(12,width/50));const tw=font.widthOfTextAtSize(t,sz);
        const x=pos==='bc'?(width-tw)/2:width-tw-36,y=pos==='tr'?height-30:20;p.drawText(t,{x,y,size:sz,font,color:PDFLib.rgb(.25,.25,.25)})});
      const r=await doc.save();closeSheet();await addPdfToShelf(r,book.title+' (numbered)')}catch(x){toolErr(x)}};
}
/* --- forms --- */
async function formSheet(book){
  let doc,form,fields;try{doc=await loadLibDoc(await pdfBytesOf(book));form=doc.getForm();fields=form.getFields()}catch(e){toolErr(e);return}
  if(!fields.length){sheet(`<h2>No form fields</h2><p class="muted">This PDF has no fillable fields. You can still type on it with <b>Text</b> in the pen tools at the top of the reader.</p><div class="mact"><button class="btn primary" data-a="x">OK</button></div>`).onclick=ev=>{if(ev.target.closest('[data-a]'))closeSheet()};return}
  const kindOf=f=>f instanceof PDFLib.PDFTextField?'PDFTextField':f instanceof PDFLib.PDFCheckBox?'PDFCheckBox':f instanceof PDFLib.PDFDropdown?'PDFDropdown':f instanceof PDFLib.PDFOptionList?'PDFOptionList':f instanceof PDFLib.PDFRadioGroup?'PDFRadioGroup':'other';
  const row=(f,i)=>{const n=esc(f.getName()),t=kindOf(f);
    try{if(t==='PDFTextField')return `<label class="f">${n}<input type="text" data-fi="${i}" value="${esc(f.getText()||'')}" dir="auto"></label>`;
      if(t==='PDFCheckBox')return `<label class="chk"><input type="checkbox" data-fi="${i}"${f.isChecked()?' checked':''}><span>${n}</span></label>`;
      if(t==='PDFDropdown'||t==='PDFOptionList'){const sel=f.getSelected()[0];return `<label class="f">${n}<select data-fi="${i}" style="display:block;width:100%;height:42px;margin-top:6px;border-radius:10px;border:1px solid var(--line);background:var(--wall)"><option value=""></option>${f.getOptions().map(o=>`<option${o===sel?' selected':''}>${esc(o)}</option>`).join('')}</select></label>`}
      if(t==='PDFRadioGroup'){const sel=f.getSelected();return `<label class="f">${n}<select data-fi="${i}" style="display:block;width:100%;height:42px;margin-top:6px;border-radius:10px;border:1px solid var(--line);background:var(--wall)"><option value=""></option>${f.getOptions().map(o=>`<option${o===sel?' selected':''}>${esc(o)}</option>`).join('')}</select></label>`}}catch(e){}
    return ''};
  const b=sheet(`<h2>Fill in the form</h2><div style="max-height:56vh;overflow:auto">${fields.map(row).join('')}</div><label class="chk"><input type="checkbox" id="fmFlat"><span>Lock the answers so they can’t be changed</span></label>
    <div class="mact"><button class="btn" data-a="x">Cancel</button><button class="btn primary" data-a="go">Save filled copy</button></div>`);
  b.onclick=async e=>{const a=e.target.closest('[data-a]');if(!a)return;if(a.dataset.a==='x'){closeSheet();return}
    try{$$('[data-fi]',b).forEach(el=>{const f=fields[Number(el.dataset.fi)],t=kindOf(f);
        if(t==='PDFTextField')f.setText(el.value);else if(t==='PDFCheckBox'){el.checked?f.check():f.uncheck()}else if(el.value){f.select(el.value)}});
      if($('#fmFlat').checked)form.flatten();const r=await doc.save();closeSheet();await addPdfToShelf(r,book.title+' (filled)')}catch(x){toolErr(x)}};
}
/* --- conversions --- */
async function pdfToWord(book){
  toolBusy('Converting to Word');
  try{const opts={title:book.title,author:book.author||'',dir:'auto',hf:true,imagePages:true};const ctl={cancel:false};
    const parts=await pdfToChapters(book,opts,(p,m)=>setBusy(m,p),ctl);
    const d=document.createElement('div');d.innerHTML=parts.map(c=>c.html).join('<p></p>');d.querySelectorAll('[role="doc-pagebreak"]').forEach(x=>x.remove());
    d.querySelectorAll('img').forEach(im=>{const n=(im.getAttribute('src')||'').replace(/^img\//,'');const m=parts.images.find(x=>x.name===n);if(m)im.src='data:image/jpeg;base64,'+bufToB64(m.data);else im.remove()});
    document.body.appendChild(d);d.style.cssText='position:absolute;left:-9999px;top:0;width:800px';await sleep(50);
    const prev=O.book;O.book={title:book.title};const buf=await buildDocx(d);O.book=prev;d.remove();
    closeSheet();const nb=await (async()=>{const before=new Set(books.map(b=>b.id));await importFiles([new File([buf],safeName(book.title)+'.docx',{type:OFFICE_MIME.docx})]);return books.find(b=>!before.has(b.id))})();
    const s=sheet(`<h2>Your Word file is ready</h2><p class="muted">It’s on your shelf under Documents. Check tables and special layouts, which may come out simpler.</p><div class="mact"><button class="btn" data-a="save">Save .docx file</button><button class="btn primary" data-a="open">Open it</button></div>`);
    s.onclick=e=>{const a=e.target.closest('[data-a]');if(!a)return;closeSheet();if(a.dataset.a==='save')BS.saveFile(safeName(book.title)+'.docx',new Blob([buf]),OFFICE_MIME.docx);else if(nb)openBook(nb)};
  }catch(x){toolErr(x)}
}
async function pdfToText(book){
  toolBusy('Getting the text');try{const doc=await loadPdf(await pdfBytesOf(book));const parts=[];
    for(let i=1;i<=doc.numPages;i++){const pg=await doc.getPage(i);const tc=await pg.getTextContent();const lines=pageLines(tc.items,pg.getViewport({scale:1}));parts.push(`--- Page ${i} ---\n`+lines.map(l=>l.text).join('\n'));setBusy(`Page ${i} of ${doc.numPages}`,i/doc.numPages)}
    doc.destroy();closeSheet();const txt=parts.join('\n\n');if(!txt.replace(/--- Page \d+ ---/g,'').trim()){toast('No text was found. This PDF looks scanned.');return}
    await BS.saveFile(safeName(book.title)+'.txt',txt,'text/plain')}catch(x){toolErr(x)}
}
async function pdfToImages(book){
  toolBusy('Saving pages as pictures');try{const doc=await loadPdf(await pdfBytesOf(book));const z=new JSZip();
    for(let i=1;i<=doc.numPages;i++){const pg=await doc.getPage(i);const vp=pg.getViewport({scale:2});const c=document.createElement('canvas');c.width=Math.round(vp.width);c.height=Math.round(vp.height);const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);await pg.render({canvasContext:ctx,viewport:vp}).promise;
      z.file(`page-${String(i).padStart(3,'0')}.png`,new Uint8Array(await (await new Promise(r=>c.toBlob(r,'image/png'))).arrayBuffer()));c.width=0;setBusy(`Page ${i} of ${doc.numPages}`,i/doc.numPages)}
    doc.destroy();const blob=await z.generateAsync({type:'blob'});closeSheet();await BS.saveFile(safeName(book.title)+' (pages).zip',blob,'application/zip')}catch(x){toolErr(x)}
}

/* --- signature pad --- */
function signaturePad(done){
  const b=sheet(`<h2>Your signature</h2><p class="muted" style="margin:0">Sign in the box with your finger or mouse.</p><canvas id="sigC" width="600" height="220" style="width:100%;height:auto;border:1px dashed var(--line);border-radius:12px;background:#fff;touch-action:none;margin-top:10px"></canvas>
    <div class="mact"><button class="btn" data-a="clr">Clear</button><button class="btn" data-a="x">Cancel</button><button class="btn primary" data-a="ok">Use this signature</button></div>`);
  const c=$('#sigC'),ctx=c.getContext('2d');ctx.lineWidth=4;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#1a2a6c';let drawing=false,any=false;
  const pt=e=>{const r=c.getBoundingClientRect();return[(e.clientX-r.left)*c.width/r.width,(e.clientY-r.top)*c.height/r.height]};
  c.onpointerdown=e=>{drawing=true;any=true;c.setPointerCapture(e.pointerId);const [x,y]=pt(e);ctx.beginPath();ctx.moveTo(x,y)};
  c.onpointermove=e=>{if(!drawing)return;const [x,y]=pt(e);ctx.lineTo(x,y);ctx.stroke()};c.onpointerup=()=>{drawing=false};
  b.onclick=e=>{const a=e.target.closest('[data-a]');if(!a)return;if(a.dataset.a==='clr'){ctx.clearRect(0,0,c.width,c.height);any=false;return}if(a.dataset.a==='x'){closeSheet();return}
    if(!any){toast('Sign in the box first');return}
    const d=ctx.getImageData(0,0,c.width,c.height).data;let x0=c.width,y0=c.height,x1=0,y1=0;for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(d[(y*c.width+x)*4+3]>0){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}
    const w=x1-x0+8,h=y1-y0+8;const o=document.createElement('canvas');o.width=w;o.height=h;o.getContext('2d').drawImage(c,x0-4,y0-4,w,h,0,0,w,h);
    const sig={src:o.toDataURL('image/png'),ar:h/w};LS.set('sig',sig);closeSheet();done&&done(sig)};
}
function textAnnSheet(a,onDone){
  const b=sheet(`<h2>${a.text?'Edit text':'Add text'}</h2><textarea id="taT" dir="auto" placeholder="Type here">${esc(a.text||'')}</textarea>
    <div class="mact">${a.text?'<button class="btn danger" data-a="del">Delete</button>':''}<button class="btn" data-a="x">Cancel</button><button class="btn primary" data-a="ok">Done</button></div>`);
  setTimeout(()=>$('#taT').focus(),60);
  b.onclick=e=>{const k=e.target.closest('[data-a]');if(!k)return;const v=$('#taT').value.trim();closeSheet();onDone(k.dataset.a==='ok'?v:k.dataset.a==='del'?null:undefined)};
}
const TSZ={2:0.016,4:0.024,8:0.036};
async function exportExtraAnn(doc,a,geo,map,col){
  const g=geo(a.page);if(!g)return;const W=(g.rot===90||g.rot===270)?g.b.height:g.b.width,H=(g.rot===90||g.rot===270)?g.b.width:g.b.height;
  if(a.kind==='shape'){const c=col(a.color),th=a.w/1000*W;const x0=Math.min(a.x1,a.x2),x1=Math.max(a.x1,a.x2),y0=Math.min(a.y1,a.y2),y1=Math.max(a.y1,a.y2);
    if(a.shape==='rect'){const p=map(g,x0,y1),q=map(g,x1,y0);g.pg.drawRectangle({x:Math.min(p[0],q[0]),y:Math.min(p[1],q[1]),width:Math.abs(q[0]-p[0]),height:Math.abs(q[1]-p[1]),borderColor:c,borderWidth:th})}
    else if(a.shape==='ellipse'){const ctr=map(g,(x0+x1)/2,(y0+y1)/2);g.pg.drawEllipse({x:ctr[0],y:ctr[1],xScale:(x1-x0)*W/2,yScale:(y1-y0)*H/2,borderColor:c,borderWidth:th})}
    else{const s=map(g,a.x1,a.y1),e=map(g,a.x2,a.y2);g.pg.drawLine({start:{x:s[0],y:s[1]},end:{x:e[0],y:e[1]},thickness:th,color:c});
      if(a.shape==='arrow'){const ang=Math.atan2(e[1]-s[1],e[0]-s[0]),L=Math.max(8,th*4);for(const d of [2.6,-2.6]){g.pg.drawLine({start:{x:e[0],y:e[1]},end:{x:e[0]+L*Math.cos(ang+d),y:e[1]+L*Math.sin(ang+d)},thickness:th,color:c})}}}}
  else if(a.kind==='text'){const png=await doc.embedPng(await textImage(a.text,64,a.color));const h=a.size*W*1.5,w=h*png.width/png.height;const p=map(g,a.x,a.y);g.pg.drawImage(png,{x:p[0],y:p[1]-h,width:w,height:h})}
  else if(a.kind==='img'){const img=await doc.embedPng(b64ToBytes(a.src.split(',')[1]));const p=map(g,a.x,a.y+a.h);g.pg.drawImage(img,{x:p[0],y:p[1],width:a.w*W,height:a.h*H})}
}

async function pdfToChapters(book,opts,onP,ctl){
  const doc=await loadPdf(await pdfBytesOf(book));const n=doc.numPages;const pages=[];const images=[];
  try{for(let i=1;i<=n;i++){if(ctl.cancel)return null;const page=await doc.getPage(i);const vp=page.getViewport({scale:1});
    let lines=[];try{const tc=await page.getTextContent();lines=pageLines(tc.items,vp)}catch(e){}
    const chars=lines.reduce((a,l)=>a+l.text.replace(/\s/g,'').length,0);let img=null;
    if(chars<25&&opts.imagePages){const s=Math.min(2,1100/vp.width);const v2=page.getViewport({scale:s});const c=document.createElement('canvas');c.width=Math.round(v2.width);c.height=Math.round(v2.height);
      const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);await page.render({canvasContext:ctx,viewport:v2}).promise;const jb=await new Promise(r=>c.toBlob(r,'image/jpeg',0.82));c.width=0;
      if(jb&&!isBlankish(jb)){img={name:`p${String(i).padStart(4,'0')}.jpg`,data:new Uint8Array(await jb.arrayBuffer())};images.push(img)}}
    pages.push({num:i,w:vp.width,h:vp.height,lines,img,chars});try{page.cleanup()}catch(e){}onP(i/n*0.9,`Reading page ${i} of ${n}`);if(i%2===0)await sleep(0)}}
  finally{try{doc.destroy()}catch(e){}}
  const {chapters}=assemble(pages,opts);chapters.images=images;return chapters;
}
