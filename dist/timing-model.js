// An editable pacing estimate, not a prediction of a finished film's exact duration.
(function(root){
  const nonVoice=/^(?:動作|ト書き|SE|効果音|音楽|BGM|画面|シーン|場面|カメラ|尺|説明)[：:]/i;
  const count=s=>Array.from(s.replace(/[\s「」『』、。！？!?…・：:（）()]/gu,'')).length;
  const number=(value,fallback,min,max)=>Number.isFinite(Number(value))&&value!==undefined?Math.min(max,Math.max(min,Number(value))):fallback;
  function analyze(project){
    const rate=number(project.rate,300,60,1000),actionSeconds=number(project.actionSeconds,5,1,120),speechPause=number(project.speechPause,0.6,0,20),cutPause=number(project.cutPause,0.4,0,30),mode=project.timingMode==='sequential'?'sequential':'parallel';
    const cuts=[];let spokenCharacters=0,speechUnits=0,actions=0,uncertainSpeech=0,embeddedLabels=0,musicCues=0,seCues=0;
    for(const chapter of project.chapters){
      const byLine=new Map(chapter.cuts.map(c=>[c.line,c]));let cut=null,depth=0;
      chapter.text.split('\n').forEach((raw,line)=>{
        if(byLine.has(line)){cut={id:byLine.get(line).id,speechCharacters:0,speeches:0,actions:0};cuts.push(cut);depth=0;return}
        if(!cut||!raw.trim())return;
        const text=raw.trimStart(),kind=chapter.formats?.[line];
        // Old saved projects can contain indented display labels as ordinary text.
        // Exclude their reading time without changing text or inventing cut IDs.
        if(/^[ \t\u3000]*#[ \t\u3000]*C[ \t]*\d+(?:[A-Za-z]+|[-.]\d+)?[ \t\u3000]*$/i.test(raw)){embeddedLabels++;return}
        const delta=Array.from(raw).reduce((n,c)=>n+(c==='「'?1:c==='」'?-1:0),0);
        if(depth>0){cut.speechCharacters+=count(raw);depth=Math.max(0,depth+delta);return}
        const sound=root.ScriptModel?.paragraphKind(chapter,line)||root.ScriptModel?.soundKind(raw);
        if(sound==='music'||sound==='se'){if(sound==='music')musicCues++;else seCues++;return}
        if(kind==='scene'||/^[○◯〇]/.test(text)||/^【[^\n]+】$/.test(text.trim()))return;
        const quote=text.match(/^[^「\n]+「(.*)$/),colon=text.match(/^([^：:「」\s]{1,30})[：:](.*)$/);
        if(kind==='dialogue'||quote||(colon&&!nonVoice.test(text))){
          const spoken=quote?quote[1]:colon?colon[2]:text;
          cut.speechCharacters+=count(spoken);cut.speeches++;depth=Math.max(0,delta);
          if(!quote&&colon&&kind!=='dialogue')uncertainSpeech++;
        }else cut.actions++;
      });
    }
    let seconds=0,speechSeconds=0,actionTime=0,pauseTime=0;
    for(const cut of cuts){
      spokenCharacters+=cut.speechCharacters;speechUnits+=cut.speeches;actions+=cut.actions;
      const voice=cut.speechCharacters/rate*60,pauses=cut.speeches*speechPause,action=cut.actions*actionSeconds;
      const hold=cut.speechCharacters||cut.actions?cutPause:0;
      speechSeconds+=voice;actionTime+=action;pauseTime+=pauses+hold;
      cut.seconds=(mode==='parallel'?Math.max(voice+pauses,action):voice+pauses+action)+hold;seconds+=cut.seconds;
    }
    return {seconds,musicCues,seCues,spokenCharacters,speechUnits,actions,uncertainSpeech,embeddedLabels,speechSeconds,actionTime,pauseTime,rate,actionSeconds,speechPause,cutPause,mode,cuts};
  }
  root.ScriptTiming={analyze};
})(typeof window==='undefined'?globalThis:window);
