// Deterministic proposals only. Raw text, cut boundaries and IDs never change here.
(function(root){
  const kinds=['scene','action','dialogue','music','se'];
  const scene=s=>{const t=s.trim();return /^[○◯〇]/.test(t)||/^(?:いろいろな場所・時間|[0-9０-９]+年前・[^「」。！？!?]+(?:時代|頃|回想))$/.test(t)||/^場面「[^\n]+」$/.test(t)||/^【[^\n]+】$/.test(t)||(!/[「」]/.test(t)&&/^[^（()）]+[（(][^（）()]+[）)]$/.test(t)&&/[・\s](?:春|夏|秋|冬|朝|昼|夕|夜|深夜|早朝)|[（(](?:春|夏|秋|冬|朝|昼|夕|夜|深夜|早朝)/.test(t))};
  const inferred=s=>root.ScriptModel?.soundKind(s)||(scene(s)?'scene':/^(?:[^「\n]+)?「/.test(s.trimStart())?'dialogue':'action');
  const quoteDelta=s=>[...s].reduce((n,c)=>n+(c==='「'?1:c==='」'?-1:0),0);
  function speechMarks(chapter){
    const marks={},cuts=new Set(chapter.cuts.map(q=>q.line));let depth=0;
    chapter.text.split('\n').forEach((raw,line)=>{
      if(cuts.has(line)){depth=0;return}
      const kind=root.ScriptModel?.paragraphKind(chapter,line)||chapter.formats?.[line]||inferred(raw);
      if(!depth&&kind!=='dialogue')return;
      for(let i=0;i<raw.length;i++){
        if(raw[i]==='「'){if(!depth)(marks[line]??=[]).push(i);depth++}
        else if(raw[i]==='」'&&depth){depth--;if(!depth)(marks[line]??=[]).push(i)}
      }
    });return marks;
  }
  function markerConversion(raw,oldKind,newKind,speechPositions){
    const removals=[];
    if(oldKind==='scene'&&newKind!=='scene'){const m=raw.match(/^([ \t\u3000]*)[○◯〇]/);if(m)removals.push(m[1].length)}
    if(newKind!=='dialogue'&&speechPositions!==undefined)removals.push(...speechPositions);
    else if(oldKind==='dialogue'&&newKind!=='dialogue'){
      const open=raw.indexOf('「');if(open>=0)removals.push(open);
      const closing=raw.match(/」(?=[ \t\u3000]*$)/);if(closing)removals.push(closing.index);
    }
    return {text:raw.split('').filter((_,i)=>!removals.includes(i)).join(''),removals};
  }
  const removeTypeMarkers=(raw,oldKind,newKind)=>markerConversion(raw,oldKind,newKind).text;
  function analyze(chapter){
    const cuts=new Set(chapter.cuts.map(c=>c.line));let depth=0,speechStart=null;
    return chapter.text.split('\n').map((raw,line)=>{
      const current=root.ScriptModel?.paragraphKind(chapter,line)||chapter.formats?.[line]||inferred(raw);
      if(cuts.has(line)){depth=0;speechStart=null;return {line,raw,cut:true}}
      let kind=current,certainty='uncertain',reason='文脈の確認が必要です',unit='unresolved',group=null;
      if(depth>0){kind='dialogue';certainty='certain';reason='開いたカギ括弧内の折り返し';unit='speech';group=speechStart;depth=Math.max(0,depth+quoteDelta(raw))}
      else if(!raw.trim()){certainty='unchanged';reason='空行を保持';unit='blank'}
      else if(root.ScriptModel?.memoLine(raw)){certainty='unchanged';reason='メモ';unit='memo'}
      else if(root.ScriptModel?.soundKind(raw)){kind=root.ScriptModel.soundKind(raw);certainty='certain';reason='明示的な音響指示';unit='sound'}
      else if(scene(raw)){kind='scene';certainty='certain';reason='明示的な柱';unit='scene'}
      else if(/^[^「\n]+「/.test(raw.trimStart())){kind='dialogue';certainty='certain';reason='話者とカギ括弧のある発話';unit='speech';group=line;speechStart=line;depth=Math.max(0,quoteDelta(raw))}
      else if(/^[ \t\u3000]+\S/.test(raw)||/^(?:動作|ト書き|SE|効果音)[：:]/.test(raw.trimStart())){kind='action';certainty='certain';reason='明示的な動作説明';unit='action'}
      const origin=chapter.formatOrigins?.[line]||(chapter.formats?.[line]?'legacy':'auto');
      if(origin==='manual'){kind=current;certainty='unchanged';reason='手動指定を保持'}
      else if(origin==='legacy'&&kind!==current){certainty='uncertain';reason='保存済み書式の指定元が不明です'}
      return {line,raw,current,kind,certainty,reason,unit,group,origin};
    });
  }
  function apply(chapter,plan,choices={}){
    const lines=chapter.text.split('\n'),cuts=new Set(chapter.cuts.map(c=>c.line));
    if(plan.length!==lines.length||plan.some((p,i)=>p.line!==i||p.raw!==lines[i]||!!p.cut!==cuts.has(i)))throw Error('原稿が変更されています');
    const formats=plan.map(p=>{
      if(p.cut)return null;
      const choice=choices[p.line];if(choice!==undefined&&!kinds.includes(choice))throw Error('書式が不正です');
      return p.certainty==='uncertain'?(choice||p.current):p.kind;
    });
    const formatOrigins=plan.map(p=>p.cut?null:(choices[p.line]?'manual':p.certainty==='uncertain'?p.origin:p.origin==='manual'?'manual':'auto'));
    const speech=speechMarks(chapter);const text=lines.map((raw,i)=>{const next=formats[i],current=plan[i].current;raw=markerConversion(raw,current,next,speech[i]||[]).text;if(next==='dialogue'&&current!=='dialogue')raw=raw.trimStart();if(['music','se'].includes(next))return root.ScriptModel.soundText(raw,next);return ['music','se'].includes(current)?root.ScriptModel.stripSound(raw):raw}).join('\n');
    return root.ScriptModel.syncSoundCues({...chapter,text,formats:formats.map(k=>['music','se'].includes(k)?'action':k),formatOrigins});
  }
  root.ScriptFormatting={speechMarks,markerConversion,removeTypeMarkers,kinds,scene,inferred,analyze,apply};
})(typeof window==='undefined'?globalThis:window);
