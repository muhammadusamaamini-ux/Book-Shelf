
/* ================= Book Shelf: platform layer (Windows app / Android app) ================= */
const REPO='muhammadusamaamini-ux/book-shelf';
const BS={
  platform:window.electronAPI?'windows':(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform()?'android':'web'),
  version:'0.0.0',
  native:null,
  async init(){
    if(this.platform==='android'){try{this.native=window.Capacitor.registerPlugin('BookShelfNative');const i=await this.native.getInfo();this.version=i.version||this.version}catch(e){console.warn(e)}}
    else if(this.platform==='windows'){try{this.version=await window.electronAPI.version()}catch(e){}}
    const v=$('#appVersion');if(v)v.textContent=this.version;
  },
  async saveFile(name,data,mime){
    const blob=data instanceof Blob?data:new Blob([typeof data==='string'?new TextEncoder().encode(data):data],{type:mime||'application/octet-stream'});
    try{
      if(this.platform==='windows'){const buf=await blob.arrayBuffer();const r=await window.electronAPI.saveFile(name,new Uint8Array(buf));if(r&&r.saved)toast('Saved to '+r.path);return !!(r&&r.saved)}
      if(this.platform==='android'){const b64=bufToB64(await blob.arrayBuffer());const r=await this.native.saveFile({name,mime:mime||blob.type||'application/octet-stream',data:b64});if(r&&r.saved)toast('Saved');return !!(r&&r.saved)}
      const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),4000);return true;
    }catch(e){console.warn(e);toast('The file couldn’t be saved: '+(e&&e.message||'unknown problem'));return false}
  },
  /* files opened from outside ("Open with" / Share) */
  async takeIncoming(){
    try{
      if(this.platform==='android'){const r=await this.native.getPendingFile();if(r&&r.path){const res=await fetch(window.Capacitor.convertFileSrc('file://'+r.path));const buf=await res.arrayBuffer();await openIncoming(new File([buf],r.name||'file',{type:r.mime||''}))}}
      else if(this.platform==='windows'){const list=await window.electronAPI.takePendingFiles();for(const f of list||[])await openIncoming(new File([f.data],f.name))}
    }catch(e){console.warn(e)}
  }
};
async function openIncoming(file){
  const before=new Set(books.map(b=>b.id));
  await importFiles([file]);
  let b=books.find(x=>!before.has(x.id));
  if(!b){const k=await hashBuf(await file.arrayBuffer());b=books.find(x=>x.k===k)}
  if(b){goShelf();setTimeout(()=>openBook(b),80)}
}
if(window.electronAPI)window.electronAPI.onOpenFile(()=>BS.takeIncoming());
window.addEventListener('bookshelf-open',()=>BS.takeIncoming());

/* ---------- updates ---------- */
const Upd={latest:null,
  newer(a,b){const p=s=>String(s).replace(/^v/,'').split('.').map(n=>parseInt(n,10)||0);const x=p(a),y=p(b);for(let i=0;i<Math.max(x.length,y.length);i++){if((x[i]||0)!==(y[i]||0))return (x[i]||0)>(y[i]||0)}return false},
  async check(quiet){
    if(BS.platform==='web'){if(!quiet)toast('Updates work in the installed app.');return}
    try{
      if(BS.platform==='windows'){const r=await window.electronAPI.checkUpdate();if(r&&r.available){this.offer(r.version,r.notes)}else if(!quiet)toast('You have the latest version ('+BS.version+')');LS.set('updChecked',Date.now());return}
      const res=await fetch(`https://api.github.com/repos/${REPO}/releases/latest`,{headers:{Accept:'application/vnd.github+json'},cache:'no-store'});
      if(!res.ok)throw new Error(res.status===404?'No released version was found yet':'GitHub answered '+res.status);
      const rel=await res.json();const ver=(rel.tag_name||'').replace(/^v/,'');const apk=(rel.assets||[]).find(a=>/\.apk$/i.test(a.name));
      LS.set('updChecked',Date.now());
      if(apk&&this.newer(ver,BS.version)){this.latest={ver,url:apk.browser_download_url,size:apk.size};this.offer(ver,rel.body)}else if(!quiet)toast('You have the latest version ('+BS.version+')');
    }catch(e){console.warn(e);if(!quiet)toast('Couldn’t check for updates: '+(e&&e.message||'no connection'))}
  },
  offer(ver,notes){
    const b=sheet(`<h2>Update available</h2><p class="muted">Version <b>${esc(ver)}</b> is ready. You have ${esc(BS.version)}.</p>${notes?`<div class="note" style="max-height:30vh;overflow:auto;white-space:pre-wrap">${esc(String(notes).slice(0,1500))}</div>`:''}
      <p class="muted" style="font-size:13px">Your books, highlights and settings are kept.</p><div class="mact"><button class="btn" data-a="later">Later</button><button class="btn primary" data-a="go">Update now</button></div>`);
    b.onclick=e=>{const a=e.target.closest('[data-a]');if(!a)return;if(a.dataset.a==='later'){closeSheet();return}this.install()};
  },
  async install(){
    const b=sheet(`<h2>Downloading the update…</h2><p class="muted stat" id="bsub">Starting…</p><div class="pbar"><i id="bbar" style="width:3%"></i></div>`);
    try{
      if(BS.platform==='windows'){window.electronAPI.onUpdateProgress(p=>setBusy(`Downloaded ${Math.round(p)}%`,p/100));await window.electronAPI.downloadUpdate();setBusy('Installing… Book Shelf will restart.',1);await window.electronAPI.installUpdate();return}
      const h=await BS.native.addListener('downloadProgress',p=>setBusy(p.total?`Downloaded ${fmtSize(p.loaded)} of ${fmtSize(p.total)}`:`Downloaded ${fmtSize(p.loaded)}`,p.total?p.loaded/p.total:.5));
      const r=await BS.native.installUpdate({url:this.latest.url});try{h.remove()}catch(e){}
      if(r&&r.needsPermission){sheet(`<h2>One more step</h2><p class="muted">Android needs your permission for Book Shelf to install its own updates. In the screen that opened, turn on <b>Allow from this source</b>, come back, and tap <b>Update now</b> again.</p><div class="mact"><button class="btn primary" data-a="x">OK</button></div>`).onclick=e=>{if(e.target.closest('[data-a]'))closeSheet()};return}
      closeSheet();
    }catch(e){console.warn(e);sheet(`<h2>The update didn’t finish</h2><p class="muted">${esc(e&&e.message||'Check your connection and try again.')}</p><div class="mact"><button class="btn primary" data-a="x">OK</button></div>`).onclick=ev=>{if(ev.target.closest('[data-a]'))closeSheet()}}
  }
};

/* ---------- app menu (shelf) ---------- */
function appMenu(){
  const b=sheet(`<h2>Book Shelf</h2><p class="muted stat" style="margin:0">Version <span id="appVersion">${esc(BS.version)}</span> · ${BS.platform==='windows'?'Windows':BS.platform==='android'?'Android':'Browser'}</p>
   <div class="menu">
    <button data-m="upd"><svg class="i"><use href="#i-down"/></svg><span>Check for updates</span></button>
    <button data-m="sync"><svg class="i"><use href="#i-rot"/></svg><span>Sync between devices<small>${Sync.on?'Connected':'Set up with a private GitHub repository'}</small></span></button>
    <button data-m="tools"><svg class="i"><use href="#i-file"/></svg><span>PDF tools<small>Merge PDFs, pictures to PDF</small></span></button>
    <button data-m="dict"><svg class="i"><use href="#i-search"/></svg><span>Dictionary<small>Works offline</small></span></button>
    <button data-m="about"><svg class="i"><use href="#i-book"/></svg><span>About and credits</span></button>
   </div><div class="mact"><button class="btn" data-a="x">Close</button></div>`);
  b.onclick=e=>{const a=e.target.closest('[data-m],[data-a]');if(!a)return;const m=a.dataset.m;
    if(!m){closeSheet();return}
    if(m==='upd'){closeSheet();Upd.check(false)}else if(m==='sync')syncSheet();else if(m==='tools')shelfPdfTools();else if(m==='dict'){closeSheet();openDict();setTimeout(()=>$('#dictQ').focus(),60)}
    else if(m==='about')sheet(`<h2>About Book Shelf</h2><p class="muted">Your personal reader for PDF, EPUB, Word, Excel and PowerPoint files.</p><p class="muted" style="font-size:13px">Dictionary: Open English WordNet 2024 (CC BY 4.0), globalwordnet.github.io. PDF rendering: PDF.js. Editing: pdf-lib, SheetJS, mammoth, docx-preview, JSZip.</p><div class="mact"><button class="btn primary" data-a="x">OK</button></div>`).onclick=ev=>{if(ev.target.closest('[data-a]'))closeSheet()}};
}

/* ---------- offline dictionary ---------- */
const DICT={shards:new Map()};
async function dictShard(c){c=/[a-z]/.test(c)?c:'_';if(DICT.shards.has(c))return DICT.shards.get(c);const p=fetch('dict/'+c+'.json').then(r=>r.json()).catch(()=>({}));DICT.shards.set(c,p);return p}
async function dictGet(w){const sh=await dictShard(w[0]);return sh[w]||null}
async function dictForms(w){const sh=await dictShard(w[0]);return sh['~'+w]||null}
function morphy(w){
  const out=[];const add=x=>{if(x&&x.length>1&&!out.includes(x))out.push(x)};
  const rules=[['ies','y'],['es','e'],['es',''],['s',''],['ses','s'],['xes','x'],['zes','z'],['ches','ch'],['shes','sh'],['men','man'],['ied','y'],['ed','e'],['ed',''],['ing','e'],['ing',''],['ier','y'],['iest','y'],['er','e'],['er',''],['est','e'],['est',''],['ly',''],['ily','y'],["'s",''],["’s",'']];
  for(const [suf,rep] of rules)if(w.endsWith(suf)){const base=w.slice(0,-suf.length)+rep;add(base);if(/(ed|ing|er|est)$/.test(suf)&&/([bcdfgklmnprstvz])\1$/.test(base))add(base.slice(0,-1))}
  return out;
}
async function dictLookup(word){
  let w=word.trim().toLowerCase().replace(/[“”"‘’'.,;:!?()\[\]{}]+$/,'').replace(/^[“”"‘’'(\[{]+/,'').replace(/\s+/g,' ');if(!w)return null;
  const hits=[];const seen=new Set();
  const take=async k=>{if(seen.has(k))return;seen.add(k);const e=await dictGet(k);if(e)hits.push({key:k,entries:e})};
  await take(w);
  const f=await dictForms(w);if(f)for(const k of f)await take(k);
  if(!hits.length)for(const k of morphy(w))await take(k);
  if(!hits.length&&w.includes('-'))await take(w.replace(/-/g,' '));
  return hits.length?{word:w,hits}:{word:w,hits:[],suggest:await dictSuggest(w)};
}
async function dictSuggest(w){const sh=await dictShard(w[0]);const pre=w.slice(0,Math.max(2,Math.min(4,w.length-1)));const out=[];for(const k in sh){if(k[0]!=='~'&&k.startsWith(pre)){out.push(k);if(out.length>=8)break}}return out}

/* ---------- Android: read aloud through the phone's own text-to-speech ---------- */
(function(){
  if(BS.platform!=='android'||(window.speechSynthesis&&window.SpeechSynthesisUtterance))return;
  let tts=null;try{tts=window.Capacitor.registerPlugin('TextToSpeech')}catch(e){}
  if(!tts)return;
  let voices=[];tts.getSupportedVoices().then(r=>{voices=(r&&r.voices)||[]}).catch(()=>{});
  window.SpeechSynthesisUtterance=function(text){this.text=text;this.rate=1;this.lang='';this.voice=null;this.onend=null;this.onerror=null};
  let seq=0;
  window.speechSynthesis={speaking:false,
    getVoices(){return voices},addEventListener(){},
    speak(u){const my=++seq;this.speaking=true;const vi=u.voice?voices.indexOf(u.voice):-1;
      tts.speak({text:u.text,lang:u.lang||(u.voice&&u.voice.lang)||'en-US',rate:Math.max(0.1,Math.min(2,u.rate||1)),pitch:1,volume:1,...(vi>=0?{voice:vi}:{}),category:'playback'})
        .then(()=>{if(my!==seq)return;this.speaking=false;u.onend&&u.onend()})
        .catch(e=>{if(my!==seq)return;this.speaking=false;u.onerror&&u.onerror({error:'interrupted'})})},
    cancel(){seq++;this.speaking=false;tts.stop().catch(()=>{})},pause(){this.cancel()},resume(){}};
})();
