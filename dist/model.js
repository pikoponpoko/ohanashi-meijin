/* Version 2 keeps legacy text; only explicit #C lines are cut boundaries. */
(function(root){
  const marker=/^#C\d+[A-Za-z]?\s*$/;
  const id=()=>crypto.randomUUID();
  const newline=s=>s.replace(/\r\n?/g,'\n');
  // External TXT syntax is broader than the canonical saved v2 boundary syntax.
  // Never reinterpret already-saved JSON or ordinary prose as external metadata.
  const externalMarker=/^[ \t\u3000]*#[ \t\u3000]*C[ \t]*\d+(?:[A-Za-z]+|[-.]\d+)?[ \t\u3000]*$/i;
  const preproHeader=/^#プリプロ名人 (?:脚本管理|台詞一覧)(?:（このまま書き換えて(?:保存すると、プリプロ名人に反映できます|、コピーしてからプリプロ名人に戻ると反映できます)）)?$/;
  function importText(text){
    let lines=newline(text.replace(/^\uFEFF/,'')).split('\n');
    const first=lines.findIndex(line=>externalMarker.test(line));
    // Strip only known export metadata and blank padding before a real cut.
    // Unknown forewords and intentional explicit empty cuts remain intact.
    if(first>=0&&lines.slice(0,first).every(line=>!line.trim()||preproHeader.test(line.trim())))lines=lines.slice(first);
    return lines.map(line=>externalMarker.test(line)?'#C1':line).join('\n');
  }
  function importChapter(c){return migrateChapter({...c,text:importText(c.text)})}
  function migrateChapter(c){
    let text=newline(c.text), lines=text.split('\n');
    if(!marker.test(lines[0]))lines.unshift('#C1');
    const cuts=lines.flatMap((s,line)=>marker.test(s)?[{id:id(),line}]:[]);
    return {...c,id:typeof c.id==='string'&&c.id?c.id:id(),text:lines.join('\n'),cuts};
  }
  function renumber(project){let n=0;for(const c of project.chapters){const lines=c.text.split('\n');for(const cut of c.cuts)lines[cut.line]='#C'+(++n);c.text=lines.join('\n')}return project}
  function checkCuts(chapters){const seen=new Set();for(const c of chapters){if(!Array.isArray(c.cuts)||!c.cuts.length)throw Error('カット情報がありません');let previous=-1;const lines=c.text.split('\n');for(const cut of c.cuts){if(!cut||typeof cut.id!=='string'||!cut.id||seen.has(cut.id)||!Number.isInteger(cut.line)||cut.line<=previous||cut.line>=lines.length||!marker.test(lines[cut.line]))throw Error('カット情報が不正です');seen.add(cut.id);previous=cut.line}if(c.cuts[0].line!==0||lines.some((s,i)=>marker.test(s)&&!c.cuts.some(x=>x.line===i)))throw Error('カット境界が不正です')}}
  function validate(v,defaults){
    if(!v||typeof v!=='object'||![1,2,undefined].includes(v.version)||!Array.isArray(v.chapters)||!v.chapters.length||v.chapters.some(c=>!c||typeof c.text!=='string'||typeof c.title!=='string'))throw Error('原稿形式が違います');
    for(const k of ['title','author','date'])if(v[k]!==undefined&&typeof v[k]!=='string')throw Error('作品情報が不正です');
    const ids=new Set();let chapters=v.chapters.map(c=>{const next=v.version===2?{...c}:migrateChapter(c);if(typeof next.id!=='string'||!next.id||ids.has(next.id))throw Error('章IDが不正です');ids.add(next.id);return {...next,status:['完了','見直し','未着手'].includes(c.status)?c.status:'未着手'}});
    checkCuts(chapters);for(const c of chapters)if(c.placeholderFormat!==undefined&&!['scene','action','dialogue'].includes(c.placeholderFormat))throw Error('編集中の段落書式が不正です');for(const c of chapters)if(c.formats!==undefined&&(!Array.isArray(c.formats)||c.formats.length!==c.text.split('\n').length||c.formats.some(k=>![null,'scene','action','dialogue'].includes(k))))throw Error('段落情報が不正です');
    const result={...defaults,...v,version:2,chapters};
    result.font=['Noto Serif JP','Noto Sans JP','Zen Old Mincho'].includes(v.font)?v.font:defaults.font;
    for(const [k,min,max,fallback] of [['size',14,32,14],['printSize',9,18,12],['rate',60,1000,300],['actionSeconds',1,120,5],['draft',1,9999,1]])result[k]=Math.min(max,Math.max(min,Number(v[k])||fallback));
    result.direction=v.direction==='horizontal'?'horizontal':'vertical';result.dark=!!v.dark;result.cover=v.cover!==false;
    return renumber(result);
  }
  function repair(c){const lines=c.text.split('\n'),out=[],cuts=[],formats=[];let blank=false;const byLine=new Map(c.cuts.map(x=>[x.line,x]));for(let i=0;i<lines.length;i++){if(byLine.has(i)){cuts.push({...byLine.get(i),line:out.length});out.push(lines[i]);formats.push(c.formats?.[i]||null);blank=false}else if(!lines[i].trim()){if(!blank){out.push('');formats.push(c.formats?.[i]||null);}blank=true}else{out.push(lines[i]);formats.push(c.formats?.[i]||null);blank=false}}return {...c,text:out.join('\n'),cuts,formats}}
  // Explicit cleanup only: never strip intentional line breaks during typing/save.
  const blankLine=s=>/^[\s\u200B\u2060]*$/u.test(s);
  function removeBlankLines(c){
    const out=[],cuts=[],formats=[],byLine=new Map(c.cuts.map(x=>[x.line,x]));
    c.text.split('\n').forEach((line,i)=>{
      const cut=byLine.get(i);
      if(!cut&&blankLine(line))return;
      if(cut)cuts.push({...cut,line:out.length});
      out.push(line);formats.push(c.formats?.[i]||null);
    });
    return {...c,text:out.join('\n'),cuts,formats};
  }
  root.ScriptModel={marker,newline,migrateChapter,importText,importChapter,renumber,validate,repair,removeBlankLines,blankLine,checkCuts};
})(typeof window==='undefined'?globalThis:window);
