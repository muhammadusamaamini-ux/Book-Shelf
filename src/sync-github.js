const MAXUP=45*1024*1024;
function canon(v){if(Array.isArray(v))return '['+v.map(canon).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canon(v[k])).join(',')+'}';return JSON.stringify(v===undefined?null:v)}
const byIdSort=arr=>[...(arr||[])].sort((a,b)=>String(a.id).localeCompare(String(b.id)));
function strHash(s){let h=2166136261>>>0;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)>>>0}return h.toString(36)+':'+s.length}
function utf8B64(s){return bufToB64(new TextEncoder().encode(s))}
function b64Utf8(b){return new TextDecoder().decode(b64ToBytes(b.replace(/\s/g,'')))}
const EXT={pdf:'pdf',epub:'epub',docx:'docx',xlsx:'xlsx',pptx:'pptx'};
/* Sync keeps a small JSON file per book in YOUR private GitHub repository (and, if they fit, the book files themselves). */
const GH={
  cfg(){return LS.get('ghsync',null)},
  q:Promise.resolve(),
  serial(fn){const p=this.q.then(fn,fn);this.q=p.catch(()=>{});return p},
  async req(method,path,body,accept){
    const c=this.cfg();if(!c)throw new Error('Sync is not set up');
    const r=await fetch('https://api.github.com/repos/'+c.repo+path,{method,cache:'no-store',headers:{Authorization:'Bearer '+c.token,Accept:accept||'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
    return r;
  },
  async json(method,path,body){const r=await this.req(method,path,body);let j=null;try{j=await r.json()}catch(e){}if(!r.ok){const err=new Error((j&&j.message)||('GitHub answered '+r.status));err.status=r.status;throw err}return j}
};
const Sync={on:false,state:'off',timers:{},dirty:new Set(),upq:[],uploading:false,remote:{},warned:{},
  shas:LS.get('ghsha',{}),files:LS.get('ghfiles',{}),sentH:LS.get('ghsent',{}),branch:null,pollT:0,polling:false,firstDone:false,
  setState(st,txt){this.state=st;const b=$('#syncBtn');if(!b)return;b.dataset.s=st;$('#syncTxt').textContent=txt},
  persist(){LS.set('ghsha',this.shas);LS.set('ghfiles',this.files);LS.set('ghsent',this.sentH)},
  async start(){
    if(!GH.cfg()){this.on=false;this.setState('off','Sync');return}
    this.on=true;this.setState('busy','Syncing…');
    try{const repo=await GH.json('GET','');this.branch=repo.default_branch||'main'}catch(e){this.setState('err',e.status===401?'Sync: sign-in expired':'Sync paused');if(e.status===401||e.status===404)toast('Sync couldn’t reach your data repository. Check the token in Sync settings.');return}
    await this.poll();
    if(!this.bound){this.bound=true;
      window.addEventListener('online',()=>{this.poll();this.flush()});
      document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')this.flush();else this.poll()});
      setInterval(()=>{if(this.on&&document.visibilityState==='visible')this.poll()},90000)}
  },
  stop(){this.on=false;this.setState('off','Sync')},
  async poll(){
    if(!this.on||this.polling)return;this.polling=true;
    try{
      const r=await GH.req('GET','/git/trees/'+encodeURIComponent(this.branch||'main')+'?recursive=1');
      if(r.status===409||r.status===404){/* empty repository */}
      else if(!r.ok)throw new Error('GitHub answered '+r.status);
      else{const t=await r.json();const docs=[];
        for(const e of t.tree||[]){if(e.type!=='blob')continue;
          if(e.path.startsWith('sync/')&&e.path.endsWith('.json')){if(this.shas[e.path]!==e.sha)docs.push(e)}
          else if(e.path.startsWith('files/'))this.files[e.path]=e.sha}
        docs.sort((a,b)=>a.path.localeCompare(b.path));
        for(const e of docs){try{const bl=await GH.json('GET','/git/blobs/'+e.sha);const data=JSON.parse(b64Utf8(bl.content));this.shas[e.path]=e.sha;this.apply(e.path.slice(5,-5),data)}catch(x){console.warn(x)}}
        this.persist()}
      if(!this.firstDone){this.firstDone=true;this.firstSync()}
      if(!this.uploading&&!this.dirty.size)this.setState('ok','Synced');
    }catch(e){console.warn(e);this.setState('err',navigator.onLine?'Sync paused':'Offline')}
    finally{this.polling=false}
  },
  async firstSync(){
    for(const b of [...books]){if(b.sample)continue;
      if(!b.k){try{const f=await Store.getFile(b.id);if(f){b.k=await hashBuf(await f.arrayBuffer());await Store.putBook(b)}}catch(e){}}
      if(b.k){this.touch(b,1);if(!b.cloud&&!b.assetId)this.queueUpload(b)}}
    books.forEach(b=>{if(b.sourceId&&!b.srcK){const s=byId(b.sourceId);if(s&&s.k){b.srcK=s.k;this.touch(b)}}});
  },
  metaOf(b){const src=b.sourceId&&byId(b.sourceId);
    return{k:b.k,title:b.title||'',author:b.author||'',format:b.format,size:b.size||0,pages:b.pages||0,hasText:b.hasText!==false,hue:b.hue||0,cover:b.cover||null,
    assetId:b.assetId||null,srcK:b.srcK||(src&&src.k)||null,dir:b.dir||'auto',progress:b.progress||0,pos:b.pos||null,stop:b.stop||null,
    openedAt:b.openedAt||0,addedAt:b.addedAt||0,metaAt:b.metaAt||0,rot:b.rot||0,rev:b.rev||0,deleted:false}},
  hlOf(b){const items=byIdSort(b.hls);const o={k:b.k,items,bm:byIdSort(b.bookmarks),tomb:b.hlTomb||{},bmTomb:b.bmTomb||{}};
    if(JSON.stringify(o).length>800000){o.items=items.filter(a=>a.kind!=='ink');if(!this.warned[b.k]){this.warned[b.k]=1;toast(`“${b.title}” has too many drawings to sync. Highlights and notes still sync.`)}}
    return o},
  touch(b,fast){if(!this.on||!b||b.sample||!b.k)return;this.dirty.add(b.id);clearTimeout(this.timers[b.id]);this.timers[b.id]=setTimeout(()=>this.push(b.id),fast?1500:15000)},
  flush(){for(const id of [...this.dirty]){clearTimeout(this.timers[id]);this.push(id)}},
  push(id){const b=byId(id);this.dirty.delete(id);if(!b||!this.on||!b.k||b.sample)return;this.write('b-'+b.k,this.metaOf(b));this.write('h-'+b.k,this.hlOf(b))},
  write(docId,body){
    const js=canon(body),h=strHash(js);if(this.sentH[docId]===h)return;this.sentH[docId]=h;this.persist();
    return GH.serial(async()=>{
      if(this.sentH[docId]!==h)return;this.setState('busy','Syncing…');
      const path='sync/'+docId+'.json';
      const put=()=>GH.json('PUT','/contents/'+path,{message:'Book Shelf sync',content:utf8B64(JSON.stringify(body)),branch:this.branch||undefined,...(this.shas[path]?{sha:this.shas[path]}:{})});
      try{const r=await put();this.shas[path]=r.content.sha;this.persist();if(!this.uploading&&!this.dirty.size)this.setState('ok','Synced')}
      catch(e){
        if(e.status===409||e.status===422){try{const cur=await GH.json('GET','/contents/'+path+'?ref='+encodeURIComponent(this.branch||'main'));this.shas[path]=cur.sha;this.apply(docId,JSON.parse(b64Utf8(cur.content)));delete this.sentH[docId];this.persist();const k=docId.slice(2);const bb=books.find(x=>x.k===k);if(bb)this.touch(bb,1)}catch(x){console.warn(x)}return}
        console.warn(e);delete this.sentH[docId];this.persist();this.setState('err',navigator.onLine?'Sync paused':'Offline');const k=docId.slice(2);setTimeout(()=>{const bb=books.find(x=>x.k===k);if(bb)this.touch(bb)},30000)}
    });
  },
  removed(b){if(!this.on||!b.k||b.sample)return;const k=b.k;
    this.write('b-'+k,{k,deleted:true,deletedAt:Date.now()});this.write('h-'+k,{k,items:[],bm:[],tomb:{},bmTomb:{}});
    const p=b.assetId;if(p&&this.files[p])GH.serial(async()=>{try{await GH.json('DELETE','/contents/'+p,{message:'Book Shelf: remove book',sha:this.files[p],branch:this.branch||undefined});delete this.files[p];this.persist()}catch(e){console.warn(e)}})},
  mergeById(a,b,tomb){const m=new Map();
    for(const x of [...(a||[]),...(b||[])]){if(!x||!x.id)continue;const o=m.get(x.id);
      if(!o){m.set(x.id,x);continue}const ta=o.mt||o.at||0,tb=x.mt||x.at||0;
      if(tb>ta||(tb===ta&&o.pending&&!x.pending)||(tb===ta&&!o.rects&&x.rects))m.set(x.id,x)}
    return byIdSort([...m.values()].filter(x=>!(tomb&&tomb[x.id])))},
  apply(docId,d){
    if(!d)return;this.remote[docId]=d;const kind=docId.slice(0,2),k=docId.slice(2);
    let b=books.find(x=>x.k===k);
    if(kind==='b-'){
      if(d.deleted){if(b&&!b.sample){if((b.addedAt||0)>(d.deletedAt||0)){delete this.sentH[docId];this.touch(b,1);return}
          if((R&&R.book===b)||P.book===b||O.book===b)goShelf();Store.delBook(b.id);books=books.filter(x=>x!==b);books.forEach(x=>{if(x.convertedId===b.id)x.convertedId=null;if(x.sourceId===b.id)x.sourceId=null});renderShelfSoon()}
        this.sentH[docId]=strHash(canon(d));return}
      if(!b){b={id:uid(),k,cloud:true,title:d.title,author:d.author,format:d.format,size:d.size,pages:d.pages,hasText:d.hasText,hue:d.hue,cover:d.cover,assetId:d.assetId,srcK:d.srcK,dir:d.dir,
          progress:d.progress,pos:d.pos,stop:d.stop,openedAt:d.openedAt,addedAt:d.addedAt,metaAt:d.metaAt,rot:d.rot,rev:d.rev||0,bookmarks:[],hls:[]};books.push(b)}
      else{
        const open=(R&&R.book===b)||P.book===b;
        if((d.openedAt||0)>(b.openedAt||0)+1500){
          if(open){if(Math.abs((d.progress||0)-(b.progress||0))>0.002&&d.pos){const dp=d.pos;const pct=Math.round((d.progress||0)*100);
              toast(`On your other device you’re at ${b.format==='pdf'&&dp.page?'page '+dp.page:pct+'%'}.`,{label:'Go there',fn:()=>{if(d.stop){b.stop=d.stop;if(R&&R.book===b){showEpubStop(true);return}if(P.book===b){showPdfStop(true);return}}if(R&&R.book===b)restoreAnchor(dp);else if(P.book===b&&dp.page)gotoPage(dp.page)}})}}
          else{b.pos=d.pos;b.progress=d.progress;b.openedAt=d.openedAt;b.stop=d.stop||null}}
        if((d.metaAt||0)>(b.metaAt||0)){b.title=d.title;b.author=d.author;b.hue=d.hue;b.metaAt=d.metaAt}
        for(const f of ['assetId','cover','pages','srcK'])if(!b[f]&&d[f])b[f]=d[f];
        if(b.cloud&&d.assetId)b.assetId=d.assetId;
        if((d.rev||0)>(b.rev||0)&&d.assetId){b.rev=d.rev;b.assetId=d.assetId;b.size=d.size;b.cloud=true;if(O.book===b&&!O.dirty)toast('This document was changed on your other device. Go back and open it again to see the changes.')}
      }
      if(b.srcK){const s=books.find(x=>x.k===b.srcK);if(s&&s.convertedId!==b.id){b.sourceId=s.id;s.convertedId=b.id;Store.putBook(s)}}
      const cv=books.find(x=>x.srcK===k&&x!==b);if(cv&&b.convertedId!==cv.id){cv.sourceId=b.id;b.convertedId=cv.id;Store.putBook(cv)}
      Store.putBook(b);this.sentH[docId]=strHash(canon(d));
      if((b.openedAt||0)>(d.openedAt||0)+1500||(b.metaAt||0)>(d.metaAt||0)||(b.assetId&&!d.assetId)||((b.rev||0)>(d.rev||0)&&b.assetId)||(this.metaOf(b).srcK&&!d.srcK))this.touch(b,1);
      renderShelfSoon();
    }else if(kind==='h-'&&b){
      const tomb={...(b.hlTomb||{}),...(d.tomb||{})},bmTomb={...(b.bmTomb||{}),...(d.bmTomb||{})};
      const before=JSON.stringify([b.hls||[],b.bookmarks||[]]);
      b.hlTomb=tomb;b.bmTomb=bmTomb;b.hls=this.mergeById(b.hls,d.items,tomb);b.bookmarks=this.mergeById(b.bookmarks,d.bm,bmTomb);
      Store.putBook(b);this.sentH[docId]=strHash(canon(d));
      if(canon(this.hlOf(b))!==canon(d))this.touch(b,1);
      if(before!==JSON.stringify([b.hls,b.bookmarks]))refreshOpenAnns(b);
    }
  },
  async refreshOne(b){if(!this.on||!b.k||b.sample)return;try{await withTimeout(this.poll(),4000,'sync')}catch(e){}},
  queueUpload(b){if(!this.on||!b||b.sample||b.assetId||b.noUpload||b.cloud||this.upq.includes(b.id))return;this.upq.push(b.id);this.runUploads()},
  async runUploads(){
    if(this.uploading)return;this.uploading=true;
    try{while(this.upq.length&&this.on){const b=byId(this.upq.shift());if(!b||b.assetId||b.cloud||!b.k)continue;
      const f=await Store.getFile(b.id);if(!f)continue;const buf=await f.arrayBuffer();
      if(buf.byteLength>MAXUP){b.noUpload='size';await Store.putBook(b);continue}
      const path='files/'+b.k+'.'+(EXT[b.format]||'bin');
      this.setState('busy','Uploading…');
      try{await GH.serial(async()=>{const r=await GH.json('PUT','/contents/'+path,{message:'Book Shelf: add '+(b.title||'book').slice(0,60),content:bufToB64(buf),branch:this.branch||undefined,...(this.files[path]?{sha:this.files[path]}:{})});this.files[path]=r.content.sha;this.persist()});
        b.assetId=path;b.oldAsset=null;saveBook(b)}
      catch(e){console.warn(e);if(e.status===409||e.status===422){try{const cur=await GH.json('GET','/contents/'+path+'?ref='+encodeURIComponent(this.branch||'main'));this.files[path]=cur.sha;this.upq.push(b.id)}catch(x){}}
        else if(e.status===413){b.noUpload='size';await Store.putBook(b)}else{this.setState('err','Sync paused');break}}
    }}finally{this.uploading=false;if(this.state==='busy'&&!this.dirty.size)this.setState('ok','Synced')}
  },
  async fetchBook(b){
    if(!b.assetId){
      const s=sheet(`<h2>${esc(b.title)}</h2><p class="muted">This book is on your other device, but its file is too large to copy across. Add the same file on this device and your place and highlights will follow.</p><div class="mact"><button class="btn" data-a="x">Close</button><button class="btn primary" data-a="add">Add the file</button></div>`);
      s.onclick=e=>{const a=e.target.closest('[data-a]');if(!a)return;if(a.dataset.a==='add')addMenu();else closeSheet()};return false}
    if(!GH.cfg()){toast('Set up sync on this device first (⋯ → Sync between devices).');return false}
    sheet(`<h2>Getting “${esc(b.title)}”</h2><p class="muted stat" id="bsub">Downloading from your other device…</p><div class="pbar"><i id="bbar" style="width:30%"></i></div>`);
    try{
      const r=await withTimeout(GH.req('GET','/contents/'+b.assetId+'?ref='+encodeURIComponent(this.branch||'main'),null,'application/vnd.github.raw'),300000,'Downloading');
      if(!r.ok)throw new Error('The file is no longer available ('+r.status+'). Add it again on the device that has it.');
      setBusy('Saving to this device…',.8);const buf=await r.arrayBuffer();
      await Store.putFile(b.id,buf,mimeOf(b.format));b.cloud=false;await Store.putBook(b);closeSheet();renderShelf();return true;
    }catch(e){console.warn(e);const s=sheet(`<h2>That book couldn’t be downloaded</h2><p class="muted">${esc(e&&e.message||'Check your connection and try again.')}</p><div class="mact"><button class="btn primary" data-a="x">OK</button></div>`);s.onclick=ev=>{if(ev.target.closest('[data-a]'))closeSheet()};return false}
  }
};
function syncSheet(){
  const c=GH.cfg();
  if(c){const n=books.filter(b=>!b.sample&&b.k).length,cl=books.filter(b=>b.cloud).length,big=books.filter(b=>b.noUpload).length;
    const b=sheet(`<h2>Sync between your devices</h2><p class="muted">Connected to <b>${esc(c.repo)}</b>. Your shelf, places, highlights, notes and bookmarks are kept the same on every device connected to this repository.</p>
      <p class="muted stat" style="font-size:13px">${n} book${n===1?'':'s'} · status: ${esc($('#syncTxt').textContent)}${cl?` · ${cl} waiting to download here (tap them on the shelf)`:''}${big?` · ${big} too large to copy (over 45 MB), so add the file on each device`:''}</p>
      <div class="mact"><button class="btn danger" data-a="off">Disconnect</button><button class="btn" data-a="now">Sync now</button><button class="btn primary" data-a="x">OK</button></div>`);
    b.onclick=e=>{const a=e.target.closest('[data-a]');if(!a)return;const k=a.dataset.a;
      if(k==='now'){Sync.sentH={};Sync.persist();books.forEach(x=>{if(!x.sample&&x.k)Sync.touch(x,1)});Sync.poll();books.forEach(x=>Sync.queueUpload(x));toast('Syncing now')}
      if(k==='off'){LS.set('ghsync',null);Sync.stop();toast('Sync turned off on this device')}
      closeSheet()};return}
  const b=sheet(`<h2>Set up sync</h2>
    <p class="muted">Sync keeps a small file for each book (your place, highlights and notes) in a <b>private</b> GitHub repository that only you can see. Books under 45 MB are copied too.</p>
    <ol class="muted" style="padding-left:20px;font-size:14px">
      <li>On GitHub, create a new <b>private</b> repository named <b>Book-Shelf-Data</b>.</li>
      <li>Go to GitHub <b>Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token</b>. Under <i>Repository access</i> choose <b>Only select repositories → Book-Shelf-Data</b>. Under <i>Permissions → Repository permissions</i> set <b>Contents</b> to <b>Read and write</b>. Generate it and copy the token.</li>
      <li>Paste it below. Do the same on your other device with the same token.</li></ol>
    <label class="f" for="ghRepo">Data repository<input type="text" id="ghRepo" value="muhammadusamaamini-ux/Book-Shelf-Data" autocomplete="off" spellcheck="false"></label>
    <label class="f" for="ghTok">Token<input type="text" id="ghTok" placeholder="github_pat_…" autocomplete="off" spellcheck="false"></label>
    <p class="muted" id="ghMsg" style="font-size:13px"></p>
    <div class="mact"><button class="btn" data-a="x">Cancel</button><button class="btn primary" data-a="go">Connect</button></div>`);
  b.onclick=async e=>{const a=e.target.closest('[data-a]');if(!a)return;if(a.dataset.a==='x'){closeSheet();return}
    const repo=$('#ghRepo').value.trim().replace(/^https?:\/\/github\.com\//,'').replace(/\.git$/,'').replace(/\/$/,''),token=$('#ghTok').value.trim();
    if(!/^[\w.-]+\/[\w.-]+$/.test(repo)||!token){$('#ghMsg').textContent='Enter the repository as owner/name and paste the token.';return}
    $('#ghMsg').textContent='Checking…';
    try{const r=await fetch('https://api.github.com/repos/'+repo,{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json'},cache:'no-store'});const j=await r.json().catch(()=>({}));
      if(r.status===401){$('#ghMsg').textContent='GitHub didn’t accept this token. Copy it again and paste it.';return}
      if(r.status===404){$('#ghMsg').textContent='That repository wasn’t found, or the token isn’t allowed to use it.';return}
      if(!r.ok){$('#ghMsg').textContent='GitHub answered '+r.status+'. Try again.';return}
      if(j.permissions&&!j.permissions.push){$('#ghMsg').textContent='The token can read but not write. Set Contents to “Read and write”.';return}
      LS.set('ghsync',{repo,token});closeSheet();toast('Sync is on');Sync.start();
    }catch(x){$('#ghMsg').textContent='No connection. Try again when you’re online.'}};
}
