
/* ================= highlights saved inside the PDF by other apps (PDFgear, Acrobat…) ================= */
const FILE_KIND={Highlight:'hl',Underline:'ul',Squiggly:'ul',StrikeOut:'st'};
function nearestHl(color){
  if(!color||color.length<3)return'yellow';const [r,g,b]=color;let best='yellow',bd=1e9;
  for(const k of Object.keys(HL)){const m=HL[k][0].match(/\d+/g).map(Number);const d=(m[0]-r)**2+(m[1]-g)**2+(m[2]-b)**2;if(d<bd){bd=d;best=k}}
  return best;
}
function quadsOf(a){
  const q=a.quadPoints;if(!q)return[];
  if(Array.isArray(q)&&q.length&&Array.isArray(q[0]))return q.map(pts=>pts.map(p=>[p.x,p.y]));
  const flat=Array.from(q);const out=[];for(let i=0;i+7<flat.length;i+=8)out.push([[flat[i],flat[i+1]],[flat[i+2],flat[i+3]],[flat[i+4],flat[i+5]],[flat[i+6],flat[i+7]]]);return out;
}
function textInRects(items,vp,rects){
  const parts=[];
  for(const r of rects){let line='';
    for(const it of items){if(typeof it.str!=='string'||!it.str)continue;
      const t=pdfjsLib.Util.transform(vp.transform,it.transform);if(Math.abs(t[1])>Math.abs(t[0])*0.4+0.01)continue;
      const fs=Math.hypot(t[2],t[3])||it.height||10,base=t[5],top=base-fs*0.85,bot=base+fs*0.2;
      const ov=Math.min(bot,r.y+r.h)-Math.max(top,r.y);if(ov<Math.min(fs,r.h)*0.45)continue;
      const w=Math.abs(it.width||0)*vp.scale,x0=t[4],len=it.str.length,rtl=it.dir==='rtl';let s='';
      for(let j=0;j<len;j++){const cx=rtl?x0+w-(j+0.5)/len*w:x0+(j+0.5)/len*w;if(cx>=r.x-1&&cx<=r.x+r.w+1)s+=it.str[j]}
      if(s)line+=(line&&!/\s$/.test(line)&&!/^\s/.test(s)?' ':'')+s}
    if(line.trim())parts.push(line.trim())}
  return parts.join(' ').replace(/\s+/g,' ').trim();
}
async function scanFileAnnotations(book,doc){
  const found=[];
  for(let i=1;i<=doc.numPages;i++){
    let page,anns;try{page=await doc.getPage(i);anns=await page.getAnnotations({intent:'display'})}catch(e){continue}
    if(!anns||!anns.length)continue;
    const vp=page.getViewport({scale:1});let tc=null;
    for(const a of anns){
      const id='pdf-'+i+'-'+(a.id||found.length);const note=((a.contentsObj&&a.contentsObj.str)||a.contents||'').trim();
      if(FILE_KIND[a.subtype]){
        let quads=quadsOf(a);
        if(!quads.length&&a.rect){const [x1,y1,x2,y2]=a.rect;quads=[[[x1,y2],[x2,y2],[x1,y1],[x2,y1]]]}
        const px=quads.map(q=>{const pts=q.map(p=>vp.convertToViewportPoint(p[0],p[1]));const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);return{x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)}}).filter(r=>r.w>0.5&&r.h>0.5);
        if(!px.length)continue;
        if(!tc){try{tc=await page.getTextContent()}catch(e){tc={items:[]}}}
        const text=textInRects(tc.items,vp,px);
        found.push({id,kind:FILE_KIND[a.subtype],color:nearestHl(a.color),text:text||note||'(highlight)',note:text?note:'',at:1,page:i,src:'file',
          rects:px.map(r=>({p:i,x:+(r.x/vp.width).toFixed(5),y:+(r.y/vp.height).toFixed(5),w:+(r.w/vp.width).toFixed(5),h:+(r.h/vp.height).toFixed(5)}))});
      }else if((a.subtype==='Text'||a.subtype==='FreeText')&&note&&a.rect){
        const [x,y]=vp.convertToViewportPoint(a.rect[0],a.rect[3]);
        found.push({id,kind:'note',page:i,x:+clamp(x/vp.width,0,1).toFixed(4),y:+clamp(y/vp.height,0,1).toFixed(4),note,at:1,src:'file',quiet:a.subtype==='FreeText'});
      }
    }
    try{page.cleanup()}catch(e){}
    if(i%20===0)await sleep(0);
  }
  return found;
}
async function importFileAnnotations(book,doc){
  if(!book||book.format!=='pdf')return 0;
  let own=false;
  try{
    if(!doc){const f=await Store.getFile(book.id);if(!f)return 0;doc=await loadPdf(new Uint8Array(await f.arrayBuffer()));own=true}
    const found=await scanFileAnnotations(book,doc);
    const arr=hlsOf(book),tomb=book.hlTomb||{};let added=0;
    for(const a of found){if(tomb[a.id]||arr.some(x=>x.id===a.id))continue;arr.push(a);added++;if(isTextHl(a))syncTwin(book,a,'add')}
    book.fileAnnScanned=2;await saveBook(book);
    if(added&&P.book===book&&P.doc)P.visible.forEach(i=>drawAnno(i));
    return added;
  }catch(e){console.warn('reading PDF highlights failed',e);return 0}
  finally{if(own){try{doc.destroy()}catch(e){}}}
}
let fileAnnBusy=false;
async function scanShelfForFileAnnotations(){
  if(fileAnnBusy)return;fileAnnBusy=true;let total=0,booksWith=0;
  try{for(const b of [...books]){if(b.format!=='pdf'||b.cloud||b.fileAnnScanned===2||b.sample)continue;const n=await importFileAnnotations(b,null);if(n){total+=n;booksWith++}await sleep(50)}}
  finally{fileAnnBusy=false}
  if(total)toast(`Found ${total} highlight${total===1?'':'s'} made in other PDF apps (${booksWith} book${booksWith===1?'':'s'}). They’re in each book’s Highlights list.`);
}
