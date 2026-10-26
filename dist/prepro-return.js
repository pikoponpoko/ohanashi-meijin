/* Changes sent back from プリプロ名人. The manuscript stays authoritative:
   a cut is replaced only while it still equals the text プリプロ名人 imported (base),
   a cut is removed only while it still equals the text プリプロ名人 deleted,
   and everything else edited here is kept as a conflict. Nothing is reordered. */
(function(root){
  const blank=s=>/^[\s​⁠]*$/u.test(s);
  function cutsOf(c){
    const lines=c.text.split('\n');
    return c.cuts.map((cut,i)=>{
      const end=c.cuts[i+1]?.line??lines.length,rows=[];
      for(let k=cut.line+1;k<end;k++)rows.push({text:lines[k],format:c.formats?.[k]??null,origin:c.formatOrigins?.[k]??null});
      let n=rows.length;while(n&&blank(rows[n-1].text))n--;
      return {cut,marker:lines[cut.line],rows,body:rows.slice(0,n),tail:rows.slice(n),key:rows.slice(0,n).map(r=>r.text).join('\n')};
    });
  }
  function build(chapter,list){
    const text=[],formats=[],origins=[],cuts=[];
    for(const x of list){
      cuts.push({...x.cut,line:text.length});text.push(x.marker||'#C1');formats.push(null);origins.push(null);
      for(const r of x.rows){text.push(r.text);formats.push(r.format);origins.push(r.origin)}
    }
    const out={...chapter,text:text.join('\n'),cuts,formats};
    if(chapter.formatOrigins)out.formatOrigins=origins;else delete out.formatOrigins;
    delete out.soundCues;return out;
  }
  // current, incoming: validated v2 documents; info: incoming.preproReturn
  function merge(current,incoming,info){
    const base=info&&typeof info.base==='object'&&info.base?info.base:{};
    const removed=new Map((Array.isArray(info?.removed)?info.removed:[]).filter(r=>r&&typeof r.id==='string'&&typeof r.text==='string').map(r=>[r.id,r.text]));
    const inc=[];for(const c of incoming.chapters)for(const x of cutsOf(c))inc.push({...x,chapter:c});
    const incById=new Map(inc.map(x=>[x.cut.id,x]));
    const result=current.chapters.map(c=>({chapter:c,list:cutsOf(c)}));
    const counts={changed:0,added:0,removed:0,conflicts:[]};
    const label=x=>x.marker.replace(/^#/,'');
    for(const ch of result){
      ch.list=ch.list.flatMap(x=>{
        const i=incById.get(x.cut.id);
        if(!i){
          if(removed.has(x.cut.id)&&removed.get(x.cut.id)===x.key){counts.removed++;return []}
          if(removed.has(x.cut.id))counts.conflicts.push(label(x));
          return [x];
        }
        // unchanged in プリプロ名人 (still its base): whatever was written here stays, silently
        if(i.key===x.key||(typeof base[x.cut.id]==='string'&&base[x.cut.id]===i.key))return [x];
        if(typeof base[x.cut.id]==='string'&&base[x.cut.id]===x.key){counts.changed++;return [{...x,rows:[...i.body.map(r=>({...r,origin:null})),...x.tail]}]}
        counts.conflicts.push(label(x));return [x];
      });
    }
    const present=()=>new Set(result.flatMap(ch=>ch.list.map(x=>x.cut.id)));
    const known=new Set(current.chapters.flatMap(c=>c.cuts.map(x=>x.id)));
    inc.forEach((x,i)=>{
      if(known.has(x.cut.id))return;
      // deleted here after プリプロ名人 imported it: the deletion stands
      if(typeof base[x.cut.id]==='string'){counts.conflicts.push(label(x)+'（削除済み）');return}
      const ids=present();let at=null;
      for(let k=i-1;k>=0&&!at;k--)if(ids.has(inc[k].cut.id))for(const ch of result){const j=ch.list.findIndex(y=>y.cut.id===inc[k].cut.id);if(j>=0){at={ch,j:j+1};break}}
      for(let k=i+1;k<inc.length&&!at;k++)if(ids.has(inc[k].cut.id))for(const ch of result){const j=ch.list.findIndex(y=>y.cut.id===inc[k].cut.id);if(j>=0){at={ch,j};break}}
      if(!at){let ch=result.find(r=>r.chapter.id===x.chapter.id);if(!ch){ch={chapter:{id:x.chapter.id,title:x.chapter.title,status:'未着手'},list:[]};result.push(ch)}at={ch,j:ch.list.length}}
      at.ch.list.splice(at.j,0,{cut:{id:x.cut.id},marker:'#C1',rows:x.rows.map(r=>({...r,origin:null}))});counts.added++;
    });
    for(const ch of result)if(!ch.list.length)ch.list.push({cut:{id:(root.crypto||crypto).randomUUID()},marker:'#C1',rows:[]});
    const next={...current,chapters:result.map(ch=>build(ch.chapter,ch.list))};
    return {next,counts};
  }
  root.PreproReturn={merge,cutsOf};
})(typeof window==='undefined'?globalThis:window);
