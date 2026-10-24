// Deterministic proposals only. Raw text, cut boundaries and IDs never change here.
(function(root){
  const kinds=['scene','action','dialogue'];
  const scene=s=>{const t=s.trim();return /^[○◯〇]/.test(t)||/^場面「[^\n]+」$/.test(t)||/^【[^\n]+】$/.test(t)||(!/[「」]/.test(t)&&/^[^（()）]+[（(][^（）()]+[）)]$/.test(t)&&/[・\s](?:春|夏|秋|冬|朝|昼|夕|夜|深夜|早朝)|[（(](?:春|夏|秋|冬|朝|昼|夕|夜|深夜|早朝)/.test(t))};
  const inferred=s=>scene(s)?'scene':/^(?:[^「\n]+)?「/.test(s.trimStart())?'dialogue':'action';
  const quoteDelta=s=>[...s].reduce((n,c)=>n+(c==='「'?1:c==='」'?-1:0),0);
  function analyze(chapter){
    const cuts=new Set(chapter.cuts.map(c=>c.line));let depth=0,speechStart=null;
    return chapter.text.split('\n').map((raw,line)=>{
      const current=chapter.formats?.[line]||inferred(raw);
      if(cuts.has(line)){depth=0;speechStart=null;return {line,raw,cut:true}}
      let kind=current,certainty='uncertain',reason='文脈の確認が必要です',unit='unresolved',group=null;
      if(depth>0){kind='dialogue';certainty='certain';reason='開いたカギ括弧内の折り返し';unit='speech';group=speechStart;depth=Math.max(0,depth+quoteDelta(raw))}
      else if(!raw.trim()){certainty='unchanged';reason='空行を保持';unit='blank'}
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
    return {...chapter,formats,formatOrigins};
  }
  root.ScriptFormatting={kinds,scene,inferred,analyze,apply};
})(typeof window==='undefined'?globalThis:window);
