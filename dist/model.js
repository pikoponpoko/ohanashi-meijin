/* v2 cut normalization: explicit standalone labels, stable surviving IDs and aligned styles. */
(function(root){
  const marker=/^#C\d+[A-Za-z]?\s*$/;
  const id=()=>crypto.randomUUID();
  const newline=s=>s.replace(/\r\n?/g,'\n');
  // External TXT syntax is broader than the canonical saved v2 boundary syntax.
  // Never reinterpret already-saved JSON or ordinary prose as external metadata.
  const externalMarker={test:s=>/^#(?:\s*C\s*)?\d+(?:[A-Za-z]+|[-.]\d+)?$/i.test(s.replace(/[！-～]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xfee0)).trim())};
  const preproHeader=/^#プリプロ名人 (?:脚本管理|台詞一覧)(?:（このまま書き換えて(?:保存すると、プリプロ名人に反映できます|、コピーしてからプリプロ名人に戻ると反映できます)）)?$/;
  const quoteDelta=s=>[...s].reduce((n,c)=>n+(c==='「'?1:c==='」'?-1:0),0);
  const soundKind=s=>{const m=s.trimStart().match(/^(音楽|BGM|SE|ＳＥ|効果音)[：:]/);return m?(['音楽','BGM'].includes(m[1])?'music':'se'):null};
  const stripSound=s=>s.replace(/^[ \t\u3000]*(?:音楽|BGM|SE|ＳＥ|効果音)[：:]\s*/, '');
  const soundText=(s,kind)=>{if(soundKind(s)===kind)return s;const legacy=s.trim().match(/^(?:音楽|BGM|SE|ＳＥ|効果音)「([\s\S]*)」$/);return (kind==='music'?'音楽：':'SE：')+(legacy?legacy[1]:stripSound(s).trimStart())};
  function syncSoundCues(c){
    const lines=c.text.split('\n'),cuts=new Set(c.cuts.map(x=>x.line)),entries=[];let depth=0;
    lines.forEach((raw,line)=>{
      if(cuts.has(line)){depth=0;return}
      const kind=!depth&&soundKind(raw);
      if(kind){entries.push({line,kind,raw});if(!c.formats)c.formats=lines.map(()=>null);c.formats[line]='action';return}
      depth=Math.max(0,depth+quoteDelta(raw));
    });
    if(entries.length||c.soundCues)c.soundCues={version:1,entries};return c;
  }
  const paragraphKind=(c,line)=>c.soundCues?.entries.find(q=>q.line===line&&q.raw===c.text.split('\n')[line])?.kind||c.formats?.[line]||null;
  function normalizeChapter(c,{splitBlank=false}={}){
    const lines=newline(c.text).split('\n'),byLine=new Map((c.cuts||[]).map(x=>[x.line,x]));
    const segments=[];let body=[],pending=null,depth=0;
    function flush(){if(body.some(r=>!blankLine(r.text))||(c.pendingCutId&&pending?.id===c.pendingCutId))segments.push({cut:pending||{id:id()},body});body=[];pending=null;depth=0}
    lines.forEach((text,line)=>{
      const existing=byLine.get(line);
      if(existing||(!depth&&externalMarker.test(text))){
        if(body.some(r=>!blankLine(r.text)))flush();else body=[];
        // A real existing boundary supersedes an empty predecessor; a legacy label
        // reuses the current boundary when both refer to the same upcoming body.
        if(existing)pending={...existing};else if(!pending)pending={id:id()};depth=0;return;
      }
      if(splitBlank&&!depth&&blankLine(text)&&body.some(r=>!blankLine(r.text))){flush();return}
      if(splitBlank&&blankLine(text)&&!body.length)return;
      body.push({text,kind:c.formats?.[line]||null,origin:c.formatOrigins?.[line]||null});
      if(depth||!soundKind(text))depth=Math.max(0,depth+quoteDelta(text));
    });flush();
    const out=[],cuts=[],formats=[],origins=[];
    for(const segment of segments){
      cuts.push({...segment.cut,line:out.length});out.push('#C1');formats.push(null);origins.push(null);
      for(const r of segment.body){out.push(r.text);formats.push(r.kind);origins.push(r.origin)}
    }
    // A sole editing boundary is retained internally, but is never counted or printed.
    if(!cuts.length){cuts.push({id:c.cuts?.[0]?.id||id(),line:0});out.push('#C1');formats.push(null);origins.push(null)}
    const result={...c,text:out.join('\n'),cuts};
    if(c.formats)result.formats=formats;if(c.formatOrigins)result.formatOrigins=origins;
    if(result.pendingCutId&&realCuts(result).some(q=>q.id===result.pendingCutId))delete result.pendingCutId;
    return syncSoundCues(result);
  }
  function importText(text){
    let lines=newline(text.replace(/^\uFEFF/,'')).split('\n'),depth=0;
    const first=lines.findIndex(line=>externalMarker.test(line));
    if(first>=0&&lines.slice(0,first).every(line=>!line.trim()||preproHeader.test(line.trim())))lines=lines.slice(first);
    return lines.map(line=>{if(!depth&&externalMarker.test(line))return '#C1';if(depth||!soundKind(line))depth=Math.max(0,depth+quoteDelta(line));return line}).join('\n');
  }
  function importChapter(c){return normalizeChapter(migrateChapter({...c,text:importText(c.text)}),{splitBlank:true})}
  function migrateChapter(c){
    const lines=newline(c.text).split('\n'),prepend=!marker.test(lines[0]);if(prepend)lines.unshift('#C1');
    let depth=0;const cuts=[];lines.forEach((s,line)=>{if(!depth&&marker.test(s)){cuts.push({id:id(),line});depth=0}else if(depth||!soundKind(s))depth=Math.max(0,depth+quoteDelta(s))});
    return {...c,...(prepend&&c.formats?{formats:[null,...c.formats]}:{}),...(prepend&&c.formatOrigins?{formatOrigins:[null,...c.formatOrigins]}:{}),id:typeof c.id==='string'&&c.id?c.id:id(),text:lines.join('\n'),cuts};
  }
  function realCuts(c){const lines=c.text.split('\n');return c.cuts.filter((cut,i)=>lines.slice(cut.line+1,c.cuts[i+1]?.line??lines.length).some(l=>!blankLine(l)))}
  function renumber(project){let n=0;for(const c of project.chapters){const lines=c.text.split('\n'),real=new Set(realCuts(c).map(x=>x.id));if(c.pendingCutId&&real.has(c.pendingCutId))delete c.pendingCutId;for(const cut of c.cuts)lines[cut.line]='#C'+(real.has(cut.id)?++n:n+1);c.text=lines.join('\n');syncSoundCues(c)}return project}
  function checkCuts(chapters){const seen=new Set();for(const c of chapters){if(!Array.isArray(c.cuts)||!c.cuts.length)throw Error('カット情報がありません');let previous=-1;const lines=c.text.split('\n');for(const cut of c.cuts){if(!cut||typeof cut.id!=='string'||!cut.id||seen.has(cut.id)||!Number.isInteger(cut.line)||cut.line<=previous||cut.line>=lines.length||!externalMarker.test(lines[cut.line]))throw Error('カット情報が不正です');seen.add(cut.id);previous=cut.line}let depth=0;const orphan=lines.some((s,i)=>{if(c.cuts.some(x=>x.line===i)){depth=0;return false}const invalid=!depth&&marker.test(s);if(depth||!soundKind(s))depth=Math.max(0,depth+quoteDelta(s));return invalid});if((c.cuts[0].line!==0&&!lines.slice(0,c.cuts[0].line).every(blankLine))||orphan)throw Error('カット境界が不正です')}}
  function validate(v,defaults){
    if(!v||typeof v!=='object'||![1,2,undefined].includes(v.version)||!Array.isArray(v.chapters)||!v.chapters.length||v.chapters.some(c=>!c||typeof c.text!=='string'||typeof c.title!=='string'))throw Error('原稿形式が違います');
    for(const k of ['title','author','date'])if(v[k]!==undefined&&typeof v[k]!=='string')throw Error('作品情報が不正です');
    const ids=new Set();let chapters=v.chapters.map(c=>{const next=v.version===2?{...c}:migrateChapter(c);if(typeof next.id!=='string'||!next.id||ids.has(next.id))throw Error('章IDが不正です');ids.add(next.id);return {...next,status:['完了','見直し','未着手'].includes(c.status)?c.status:'未着手'}});
    for(const c of chapters)if(c.soundCues!==undefined){
      const cue=c.soundCues;
      if(!cue||cue.version!==1||Object.keys(cue).some(k=>!['version','entries'].includes(k))||!Array.isArray(cue.entries)||cue.entries.some(q=>!q||Object.keys(q).some(k=>!['line','kind','raw'].includes(k))||!Number.isInteger(q.line)||q.line<0||!['music','se'].includes(q.kind)||typeof q.raw!=='string')||new Set(cue.entries.map(q=>q.line)).size!==cue.entries.length)throw Error('音楽・SE情報が不正または未対応です');
    }
    for(const c of chapters)if(c.pendingCutId!==undefined){if(typeof c.pendingCutId!=='string'||!c.pendingCutId)throw Error('編集中のカット情報が不正です');if(c.cuts?.at(-1)?.id!==c.pendingCutId)delete c.pendingCutId;}
    checkCuts(chapters);for(const c of chapters)if(c.placeholderFormat!==undefined&&!['scene','action','dialogue'].includes(c.placeholderFormat))throw Error('編集中の段落書式が不正です');for(const c of chapters)if(c.formats!==undefined&&(!Array.isArray(c.formats)||c.formats.length!==c.text.split('\n').length||c.formats.some(k=>![null,'scene','action','dialogue'].includes(k))))throw Error('段落情報が不正です');
    for(const c of chapters)if(c.formatOrigins!==undefined&&(!Array.isArray(c.formatOrigins)||c.formatOrigins.length!==c.text.split('\n').length||c.formatOrigins.some(k=>![null,'manual','auto','legacy'].includes(k))))throw Error('書式指定元が不正です');
    chapters=chapters.map(c=>normalizeChapter(c));
    const result={...defaults,...v,version:2,chapters};
    // Stable work identity for Prepro updates. A missing ID is derived from the
    // first chapter ID so reopening the same unsaved legacy file yields the same value.
    result.workId=typeof v.workId==='string'&&v.workId.trim()&&v.workId.length<=200?v.workId:'work-'+chapters[0].id;
    result.font=['Noto Serif JP','Noto Sans JP','Zen Old Mincho'].includes(v.font)?v.font:defaults.font;
    for(const [k,min,max,fallback] of [['size',14,32,14],['printSize',9,18,12],['rate',60,1000,300],['actionSeconds',1,120,5],['draft',1,9999,1]])result[k]=Math.min(max,Math.max(min,Number(v[k])||fallback));
    result.direction=v.direction==='horizontal'?'horizontal':'vertical';result.dark=!!v.dark;result.cover=v.cover!==false;
    return renumber(result);
  }
  function repair(c){const lines=c.text.split('\n'),out=[],cuts=[],formats=[],origins=[];let blank=false;const byLine=new Map(c.cuts.map(x=>[x.line,x]));for(let i=0;i<lines.length;i++){if(byLine.has(i)){cuts.push({...byLine.get(i),line:out.length});out.push(lines[i]);formats.push(c.formats?.[i]||null);origins.push(c.formatOrigins?.[i]||null);blank=false}else if(!lines[i].trim()){if(!blank){out.push('');formats.push(c.formats?.[i]||null);origins.push(c.formatOrigins?.[i]||null);}blank=true}else{out.push(lines[i]);formats.push(c.formats?.[i]||null);origins.push(c.formatOrigins?.[i]||null);blank=false}}return syncSoundCues({...c,text:out.join('\n'),cuts,formats,...(c.formatOrigins?{formatOrigins:origins}:{})})}
  // Explicit cleanup only: never strip intentional line breaks during typing/save.
  const blankLine=s=>/^[\s\u200B\u2060]*$/u.test(s);
  function removeBlankLines(c){
    const out=[],cuts=[],formats=[],origins=[],byLine=new Map(c.cuts.map(x=>[x.line,x]));
    c.text.split('\n').forEach((line,i)=>{
      const cut=byLine.get(i);
      if(!cut&&blankLine(line))return;
      if(cut)cuts.push({...cut,line:out.length});
      out.push(line);formats.push(c.formats?.[i]||null);origins.push(c.formatOrigins?.[i]||null);
    });
    return syncSoundCues({...c,text:out.join('\n'),cuts,formats,...(c.formatOrigins?{formatOrigins:origins}:{})});
  }
  function tidyBlankLines(c){
    const lines=c.text.split('\n'),out=[],cuts=[],formats=[],origins=[],byLine=new Map(c.cuts.map(x=>[x.line,x]));
    for(let i=0;i<lines.length;i++){
      const cut=byLine.get(i);
      if(!cut&&blankLine(lines[i])){
        let next=i+1;while(next<lines.length&&!byLine.has(next)&&blankLine(lines[next]))next++;
        const keep=out.length&&cuts.at(-1)?.line!==out.length-1&&next<lines.length&&!byLine.has(next);
        if(keep){out.push('');formats.push(c.formats?.[i]||null);origins.push(c.formatOrigins?.[i]||null)}
        i=next-1;continue;
      }
      if(cut)cuts.push({...cut,line:out.length});out.push(lines[i]);formats.push(c.formats?.[i]||null);origins.push(c.formatOrigins?.[i]||null);
    }
    return syncSoundCues({...c,text:out.join('\n'),cuts,formats,...(c.formatOrigins?{formatOrigins:origins}:{})});
  }
  // Opening a file converts unmistakable legacy sound notations to the canonical prefix.
  // 「メモ：」lines are the writer's notes: excluded from detection, corrections and timing.
  const memoLine=s=>/^[ \t\u3000]*メモ[：:]/.test(s);
  const soundLabel=k=>['音楽','BGM'].includes(k)?'音楽：':'SE：';
  function detectSoundLine(raw){
    if(soundKind(raw)||memoLine(raw))return null;const t=raw.trim();let m;
    if(m=t.match(/^「(音楽|BGM|SE|ＳＥ|効果音)[：:]\s*([^「」]*)」$/))return soundLabel(m[1])+m[2];
    if(m=t.match(/^(音楽|BGM|SE|ＳＥ|効果音)((?:[（(][^（）()「」]*[）)])?)「([^「」]*)」$/))return soundLabel(m[1])+m[2]+m[3];
    if(/^[^「」\s（）()]*[^声楽]?音「[^「」]*」$/.test(t)&&!/^[^「]*音声「/.test(t))return 'SE：'+t;
    return null;
  }
  function detectSound(c){
    const lines=c.text.split('\n'),cuts=new Set(c.cuts.map(x=>x.line));let depth=0,count=0;const formats=c.formats?[...c.formats]:lines.map(()=>null),origins=c.formatOrigins?[...c.formatOrigins]:null;
    lines.forEach((raw,line)=>{
      if(cuts.has(line)){depth=0;return}
      const next=!depth&&detectSoundLine(raw);
      if(next){lines[line]=next;formats[line]='action';if(origins&&origins[line]!=='manual')origins[line]='auto';count++;return}
      if(depth||!soundKind(raw))depth=Math.max(0,depth+quoteDelta(raw));
    });
    if(!count)return {chapter:c,count};
    return {chapter:syncSoundCues({...c,text:lines.join('\n'),formats,...(origins?{formatOrigins:origins}:{})}),count};
  }
  root.ScriptModel={memoLine,detectSound,detectSoundLine,soundKind,stripSound,soundText,syncSoundCues,paragraphKind,marker,newline,migrateChapter,importText,importChapter,normalizeChapter,realCuts,externalMarker,renumber,validate,repair,removeBlankLines,tidyBlankLines,blankLine,checkCuts};
})(typeof window==='undefined'?globalThis:window);
