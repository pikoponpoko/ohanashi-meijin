/* Cloud script sync: three-way merge of the manuscript with the cloud copy.
   base = the cloud copy this device last synced, local = this manuscript, cloud = the cloud copy now.
   A part changed on one side only takes that side; a part changed on both sides differently is a conflict
   and stays as written here unless the user picks the cloud. Settings of this device (font, direction…) stay. */
(function(root){
  const blank=s=>/^[\s​⁠]*$/u.test(s);
  const INFO=['title','author','date','draft'];
  // a missing paragraph format reads as the inferred one, so a file without formats is the same script
  const kindOf=(text,format)=>{if(blank(text))return null;const k=format||root.ScriptFormatting?.inferred(text)||null;return ['music','se'].includes(k)?'action':k};
  function cutsOf(c){
    const lines=c.text.split('\n');
    return c.cuts.map((cut,i)=>{
      const end=c.cuts[i+1]?.line??lines.length,rows=[];
      for(let k=cut.line+1;k<end;k++)rows.push({text:lines[k],format:c.formats?.[k]??null,origin:c.formatOrigins?.[k]??null});
      let n=rows.length;while(n&&blank(rows[n-1].text))n--;
      return {cut,marker:lines[cut.line],rows,key:JSON.stringify(rows.slice(0,n).map(r=>[r.text,kindOf(r.text,r.format)]))};
    });
  }
  function index(doc){
    const cuts=new Map(),chapters=new Map();
    if(!doc)return {cuts,chapters,order:[]};
    const order=[];
    for(const c of doc.chapters){chapters.set(c.id,c);for(const x of cutsOf(c)){cuts.set(x.cut.id,{...x,chapter:c});order.push(x.cut.id)}}
    return {cuts,chapters,order};
  }
  // what a reader of the script sees: work info, chapters and their cuts (not this device's settings)
  function scriptKey(doc){
    if(!doc)return '';
    return JSON.stringify([INFO.map(k=>doc[k]??null),doc.chapters.map(c=>[c.id,c.title,c.status,cutsOf(c).map(x=>[x.cut.id,x.key])])]);
  }
  const preview=x=>x?x.rows.map(r=>r.text).filter(t=>!blank(t)).join('\n'):'';
  function build(chapter,list){
    const text=[],formats=[],origins=[],cuts=[];
    for(const x of list){
      cuts.push({...x.cut,line:text.length});text.push(x.marker||'#C1');formats.push(null);origins.push(null);
      for(const r of x.rows){text.push(r.text);formats.push(r.format);origins.push(r.origin)}
    }
    const out={...chapter,text:text.join('\n'),cuts,formats};
    if(chapter.formatOrigins)out.formatOrigins=origins;else delete out.formatOrigins;
    delete out.soundCues;delete out.pendingCutId;return out;
  }
  // choices: { [conflict id]: 'cloud' | 'local' } (default local)
  function merge(base,local,cloud,choices={}){
    const B=index(base),L=index(local),C=index(cloud),conflicts=[];
    const pick=(id,c)=>{conflicts.push({id,...c});return choices[id]==='cloud'};
    // work info
    const info={};
    for(const k of INFO){
      const b=base?.[k],l=local[k],c=cloud[k];
      if(l===c||c===b)continue;
      if(l===b||pick('info:'+k,{type:'info',field:k,local:String(l??''),cloud:String(c??'')}))info[k]=c;
    }
    // chapters as written here, in this order
    const result=local.chapters.map(c=>({chapter:{...c},list:cutsOf(c),fromLocal:true}));
    for(const r of result){
      const b=B.chapters.get(r.chapter.id),c=C.chapters.get(r.chapter.id);
      if(!c)continue;
      for(const k of ['title','status']){
        const bv=b?.[k],lv=r.chapter[k],cv=c[k];
        if(lv===cv||cv===bv)continue;
        if(lv===bv||(k==='title'&&pick('title:'+r.chapter.id,{type:'title',local:lv,cloud:cv})))r.chapter[k]=cv;
      }
    }
    // cuts here
    for(const r of result){
      r.list=r.list.flatMap(x=>{
        const id=x.cut.id,b=B.cuts.get(id),c=C.cuts.get(id),label=x.marker.replace(/^#/,'');
        if(c){
          if(x.key===c.key||c.key===b?.key)return [x];
          if(x.key===b?.key||pick('cut:'+id,{type:'cut',label,chapter:r.chapter.title,local:preview(x),cloud:preview(c)}))return [{...x,rows:c.rows.map(row=>({...row,origin:row.origin??null}))}];
          return [x];
        }
        if(!b)return [x];
        // deleted in the cloud: goes only while unchanged here
        if(x.key===b.key||pick('cut:'+id,{type:'removed',label,chapter:r.chapter.title,local:preview(x),cloud:''}))return [];
        return [x];
      });
    }
    // cuts in the cloud that are not here
    const present=()=>{const m=new Map();result.forEach(r=>r.list.forEach((x,j)=>m.set(x.cut.id,{r,j})));return m};
    C.order.forEach((id,i)=>{
      if(L.cuts.has(id))return;
      const c=C.cuts.get(id),b=B.cuts.get(id);
      // deleted here: comes back only when the cloud changed it and the user takes the cloud
      if(b&&(c.key===b.key||!pick('cut:'+id,{type:'deleted',label:c.marker.replace(/^#/,''),chapter:c.chapter.title,local:'',cloud:preview(c)})))return;
      const at=present();let place=null;
      for(let k=i-1;k>=0&&!place;k--){const p=at.get(C.order[k]);if(p&&C.cuts.get(C.order[k]).chapter.id===c.chapter.id)place={r:p.r,j:p.j+1}}
      for(let k=i+1;k<C.order.length&&!place;k++){const p=at.get(C.order[k]);if(p&&C.cuts.get(C.order[k]).chapter.id===c.chapter.id)place={r:p.r,j:p.j}}
      if(!place){
        let r=result.find(x=>x.chapter.id===c.chapter.id);
        if(!r){
          const {text,cuts,formats,formatOrigins,soundCues,...meta}=c.chapter;r={chapter:{...meta},list:[]};
          // after the chapter before it in the cloud, else first
          const ci=cloud.chapters.findIndex(x=>x.id===c.chapter.id);let pos=0;
          for(let k=ci-1;k>=0;k--){const j=result.findIndex(x=>x.chapter.id===cloud.chapters[k].id);if(j>=0){pos=j+1;break}}
          result.splice(pos,0,r);
        }
        place={r,j:r.list.length};
      }
      place.r.list.splice(place.j,0,{cut:{id},marker:'#C1',rows:c.rows.map(row=>({...row}))});
    });
    // a chapter deleted in the cloud goes once nothing written here is left in it
    const chapters=result.filter(r=>{
      if(r.list.length||!r.fromLocal)return r.list.length>0;
      return !(B.chapters.has(r.chapter.id)&&!C.chapters.has(r.chapter.id));
    }).map(r=>{if(!r.list.length)r.list.push({cut:{id:(root.crypto||crypto).randomUUID()},marker:'#C1',rows:[]});return build(r.chapter,r.list)});
    if(!chapters.length)chapters.push(build({id:(root.crypto||crypto).randomUUID(),title:'新しい章',status:'未着手'},[{cut:{id:(root.crypto||crypto).randomUUID()},marker:'#C1',rows:[]}]));
    const next={...local,...info,chapters};
    return {next,conflicts};
  }
  // the copy that goes up: no file-return notes; the link ID travels with the script
  function outgoing(doc,linkId){const out=JSON.parse(JSON.stringify(doc));delete out.preproReturn;out.cloudLinkId=linkId;return out}
  root.CloudModel={merge,scriptKey,outgoing,cutsOf};
})(typeof window==='undefined'?globalThis:window);
