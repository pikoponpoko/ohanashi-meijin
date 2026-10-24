(()=>{
  const originalSettings=$('#settings').onclick;
  $('#settings').onclick=()=>{
    originalSettings();
    const body=$('#dialogBody'),saveButton=$('#saveSettings');
    const section=document.createElement('div');
    section.innerHTML='<label for="speechPauseField">発話ひとまとまりの間（秒）</label><input id="speechPauseField" type="number" min="0" max="20" step="0.1"><label for="cutPauseField">カットごとの演出上の間（秒）</label><input id="cutPauseField" type="number" min="0" max="30" step="0.1"><label for="timingModeField">台詞と動作の時間</label><select id="timingModeField"><option value="parallel">同時に進む（長い方を採用）</option><option value="sequential">順番に進む（合計する）</option></select><p>柱・カット番号・音楽・SEは台詞や動作の尺に数えません。絵や音声の実測尺ではなく、執筆中の目安です。</p>';
    body.insertBefore(section,saveButton);
    const timing=ScriptTiming.analyze(state);$('#speechPauseField').value=timing.speechPause;$('#cutPauseField').value=timing.cutPause;$('#timingModeField').value=timing.mode;
    const originalSave=saveButton.onclick;
    saveButton.onclick=()=>{
      const bounded=(value,fallback,max)=>Number.isFinite(Number(value))?Math.max(0,Math.min(max,Number(value))):fallback;
      state.speechPause=bounded($('#speechPauseField').value,0.6,20);state.cutPause=bounded($('#cutPauseField').value,0.4,30);state.timingMode=$('#timingModeField').value==='sequential'?'sequential':'parallel';
      originalSave();
    };
  };
  $('#duration').onclick=()=>{
    const t=ScriptTiming.analyze(state),seconds=n=>Math.round(n*10)/10;
    modal('推定尺の計算根拠','');
    const lines=[
      '台詞 '+t.spokenCharacters+'字 ÷ '+t.rate+'字/分 = '+seconds(t.speechSeconds)+'秒',
      '音楽 '+t.musicCues+'件・SE '+t.seCues+'件は実際の音響尺が未指定のため、この推定には加算しません。',
      '動作説明 '+t.actions+'行 × '+t.actionSeconds+'秒 = '+seconds(t.actionTime)+'秒',
      '発話 '+t.speechUnits+'単位の間 '+t.speechPause+'秒、内容のある各カットの間 '+t.cutPause+'秒',
      t.mode==='parallel'?'カットごとに台詞＋発話の間と動作の長い方を採用し、カットの間を加えています。':'カットごとに台詞・発話の間・動作・カットの間を合計しています。',
      '柱は時間に数えず、カギ括弧内の折り返しを別の発話や絵変わりにしません。',
      '実際の演技・編集・音・間で変わる目安です。完成尺を固定表示していません。'
    ];
    if(t.uncertainSpeech)lines.push('コロン表記の発話候補 '+t.uncertainSpeech+'行を含みます。話者の解釈が違う場合は書式や原稿を確認してください。');
    if(t.embeddedLabels)lines.push('本文として保存されているカット番号 '+t.embeddedLabels+'行は尺から除外しました。本文・カット境界・IDは変更していません。');
    for(const text of lines){const p=document.createElement('p');p.textContent=text;$('#dialogBody').append(p)}
    const adjust=document.createElement('button');adjust.className='primary';adjust.textContent='速度と間を調整';adjust.onclick=()=>{$('#dialog').close();$('#settings').click()};$('#dialogBody').append(adjust);
  };
  stats();
})();
