// File saving is separate from autosave. Opening never forces a download.
(()=>{
  const baselineKey=KEY+'-file-baseline';let baseline=JSON.stringify(state),pendingOpen=0;try{baseline=localStorage.getItem(baselineKey)||baseline}catch(_){}
  const snapshot=()=>JSON.stringify(state);
  function markSaved(){baseline=snapshot();try{localStorage.setItem(baselineKey,baseline)}catch(_){}}
  function fileChanged(){return snapshot()!==baseline}
  async function saveFile(){
    if(composing||loadBlocked)return false;
    const captured=snapshot(),content=JSON.stringify(validate(JSON.parse(captured)),null,2);
    if(window.showSaveFilePicker){
      try{
        const handle=await showSaveFilePicker({suggestedName:(state.title||'脚本')+'.json',types:[{description:'脚本 JSON',accept:{'application/json':['.json']}}]});
        const writable=await handle.createWritable();try{await writable.write(content);await writable.close()}catch(e){try{await writable.abort()}catch(_){}throw e}
        // An edit made while the picker was open remains unsaved.
        baseline=captured;try{localStorage.setItem(baselineKey,baseline)}catch(_){}toast('保存しました');return true;
      }catch(e){if(e.name!=='AbortError')toast('保存できません。現在の作品は保持しています。');return false}
    }
    try{download(content,'json','application/json');return 'download'}catch(_){toast('保存できません。現在の作品は保持しています。');return false}
  }
  function commitOpen(incoming){if(!openDocument(incoming))return false;markSaved();return true}
  function requestOpen(incoming){
    if(composing)return;
    if(!fileChanged()&&!dirty&&!loadBlocked)return commitOpen(incoming);
    const expected=snapshot();
    modal('開く','<button id="saveAndOpen" class="primary">保存して開く</button><button id="openWithoutSaving">保存せず開く</button><button id="cancelOpen">キャンセル</button>');
    $('#cancelOpen').onclick=()=>$('#dialog').close();
    $('#openWithoutSaving').onclick=()=>{if(snapshot()!==expected)return requestOpen(incoming);commitOpen(incoming)};
    $('#saveAndOpen').onclick=async()=>{
      const result=await saveFile();if(!result)return;
      if(snapshot()!==expected)return requestOpen(incoming);
      if(result===true)return commitOpen(incoming);
      // Anchor downloads have no completion/cancellation signal. Keep A until
      // the user explicitly confirms that its save completed; cancelling keeps A.
      $('#dialogBody').innerHTML='<button id="confirmSavedOpen" class="primary">保存を確認して開く</button><button id="cancelOpen">キャンセル</button>';
      $('#cancelOpen').onclick=()=>$('#dialog').close();$('#confirmSavedOpen').onclick=()=>{if(snapshot()!==expected)return requestOpen(incoming);commitOpen(incoming)};
    };
  }
  async function saveCommand(){
    const captured=snapshot(),result=await saveFile();if(result!=='download')return result;
    modal('保存','<button id="confirmFileSaved" class="primary">保存を確認</button><button id="cancelFileSave">キャンセル</button>');
    $('#cancelFileSave').onclick=()=>$('#dialog').close();$('#confirmFileSaved').onclick=()=>{baseline=captured;try{localStorage.setItem(baselineKey,baseline)}catch(_){}$('#dialog').close()};return result;
  }
  $('#backup').textContent='保存';$('#backup').setAttribute('aria-label','保存');$('#backup').onclick=saveCommand;
  $('#import').onclick=()=>{modal('開く','<button class="primary" id="chooseFile">ファイルを選択</button>');$('#chooseFile').onclick=()=>$('#file').click()};
  $('#file').onchange=async e=>{
    const f=e.target.files[0];if(!f)return;const request=++pendingOpen;
    try{
      const text=(await f.text()).replace(/^\uFEFF/,'');if(request!==pendingOpen)return;
      if(/\.json$/i.test(f.name)||/^[\s]*[\[{]/.test(text)||/json/i.test(f.type))requestOpen(validate(JSON.parse(text)));
      else{
        if(!/\.(txt|md)$/i.test(f.name)||loadBlocked)throw Error('未対応の形式');
        const c=ScriptModel.importChapter({id:uid(),title:f.name.replace(/\.(txt|md)$/i,''),status:'未着手',text});
        const starter=state.chapters[0],replace=!state.title&&!state.author&&state.chapters.length===1&&!ScriptModel.realCuts(starter).length&&starter.title==='新しい章';
        if(replace){c.id=starter.id;state.chapters[0]=c}else state.chapters.push(c);
        active=c.id;ScriptModel.renumber(state);recordHistory();save();render();$('#dialog').close();toast('開きました');
      }
    }catch(_){toast('開けません。現在の作品は保持しています。')}
    finally{e.target.value=''}
  };
  window.FileControls={saveFile:saveCommand,fileChanged,markSaved,requestOpen};
})();
