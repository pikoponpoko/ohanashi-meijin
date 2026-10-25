// Independent of the editor shell, and deliberately outside the SW precache.
(()=>{
  const status=document.querySelector('#status'),save=document.querySelector('#saveRecovery'),repair=document.querySelector('#repairConnection');let raw;
  try{
    raw=localStorage.getItem('scenario-meijin-v1');
    try{document.body.classList.toggle('dark',JSON.parse(raw)?.dark===true)}catch(_){}
    status.textContent=raw!==null?'このブラウザの原稿を、先にファイルへ保存してください。':'この保存領域に編集中の原稿はありません。';
    save.disabled=raw===null;repair.disabled=raw!==null;
    if(raw===null)repair.textContent='接続を修復';
  }catch(_){status.textContent='原稿の読み取りが許可されていません。ブラウザの保存設定を確認してください。';return}
  save.onclick=()=>{
    try{
      const a=document.createElement('a'),url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));a.href=url;a.download='おはなし名人_接続修復前の原稿.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
      repair.disabled=false;status.textContent='ファイルの保存完了を確認してから、接続を修復してください。';
    }catch(_){status.textContent='ファイルへ保存できませんでした。原稿は変更していません。'}
  };
  repair.onclick=async()=>{
    repair.disabled=true;
    try{
      // Recheck because another app window may have saved while this page was open.
      if(localStorage.getItem('scenario-meijin-v1')!==raw){status.textContent='別の画面で原稿が更新されました。このページを開き直して保存してください。';return}
      await window.ohanashiConnection.retire();
      location.replace('./?recovered=1');
    }catch(_){repair.disabled=false;status.textContent='接続を修復できませんでした。原稿は変更していません。'}
  };
})();
