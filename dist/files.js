// File saving is separate from autosave. Opening never forces a download.
(()=>{
  const baselineKey=KEY+'-file-baseline';let baseline=JSON.stringify(state),pendingOpen=0,handle=null,generation=0,busy=false;try{baseline=localStorage.getItem(baselineKey)||baseline}catch(_){}
  const snapshot=()=>JSON.stringify(state);
  function markSaved(){baseline=snapshot();try{if(!window.ManuscriptStorage.usingDatabase)localStorage.setItem(baselineKey,baseline)}catch(_){}sync()}
  function fileChanged(){return snapshot()!==baseline}
  function sync(){
    const changed=fileChanged(),label=handle?(changed?'ファイル未保存':'ファイル保存済み'):(changed?'ファイル未保存':'ファイル未接続');
    $('#backup').disabled=busy;$('#saveAs').disabled=busy;$('#fileStatus').textContent=busy?'ファイルに保存中':label;$('#backup').textContent=changed?'保存 *':'保存';$('#backup').title=handle?'同じファイルに上書き保存':'ファイルへ保存';
  }
  function documentOpened(){generation++;handle=null;markSaved()}
  async function saveFile(asNew=false){
    if(composing||loadBlocked||busy)return false;
    const captured=snapshot(),epoch=generation,content=JSON.stringify(validate(JSON.parse(captured)),null,2);
    if(handle||window.showSaveFilePicker){
      busy=true;sync();try{
        const target=(!asNew&&handle)||await showSaveFilePicker({suggestedName:(state.title||'脚本')+'.json',types:[{description:'脚本 JSON',accept:{'application/json':['.json']}}]});
        const writable=await target.createWritable();try{await writable.write(content);await writable.close()}catch(e){try{await writable.abort()}catch(_){}throw e}
        // An edit made while the picker was open remains unsaved.
        if(epoch===generation){handle=target;baseline=captured;try{if(!window.ManuscriptStorage.usingDatabase)localStorage.setItem(baselineKey,baseline)}catch(_){}sync()}toast(epoch===generation?'ファイルに保存しました':'切り替え前の原稿をファイルに保存しました');return true;
      }catch(e){if(e.name!=='AbortError')toast('保存できません。現在の作品は保持しています。');return false}finally{busy=false;sync()}
    }
    try{download(content,'json','application/json');return 'download'}catch(_){toast('保存できません。現在の作品は保持しています。');return false}
  }
  async function commitOpen(incoming,nextHandle=null){if(!await openDocument(incoming))return false;handle=nextHandle;markSaved();return true}
  function requestOpen(incoming,nextHandle=null){
    if(composing)return;
    if(!fileChanged()&&!dirty&&!loadBlocked)return commitOpen(incoming,nextHandle);
    const expected=snapshot();
    modal('開く','<p>別の作品として開きます。現在の原稿は「保存した原稿」に残します。</p><button id="saveAndOpen" class="primary">保存して開く</button><button id="openWithoutSaving">保存せず開く</button><button id="cancelOpen">キャンセル</button>');
    $('#cancelOpen').onclick=()=>$('#dialog').close();
    $('#openWithoutSaving').onclick=()=>{if(snapshot()!==expected)return requestOpen(incoming,nextHandle);commitOpen(incoming,nextHandle)};
    $('#saveAndOpen').onclick=async()=>{
      const result=await saveFile();if(!result)return;
      if(snapshot()!==expected)return requestOpen(incoming,nextHandle);
      if(result===true)return commitOpen(incoming,nextHandle);
      // Anchor downloads have no completion/cancellation signal. Keep A until
      // the user explicitly confirms that its save completed; cancelling keeps A.
      $('#dialogBody').innerHTML='<button id="confirmSavedOpen" class="primary">保存を確認して開く</button><button id="cancelOpen">キャンセル</button>';
      $('#cancelOpen').onclick=()=>$('#dialog').close();$('#confirmSavedOpen').onclick=()=>{if(snapshot()!==expected)return requestOpen(incoming,nextHandle);commitOpen(incoming,nextHandle)};
    };
  }
  // A JSON sent from プリプロ名人: merged into the same work (by workId) after confirmation.
  // The manuscript before merging is archived by openDocument; the connected file stays connected and unsaved.
  async function receivePrepro(value){
    if(composing)return;
    const info=value.preproReturn,incoming={...value};delete incoming.preproReturn;
    const next=validate(incoming);
    if(loadBlocked||next.workId!==state.workId)return requestOpen(next);
    const expected=snapshot(),{next:merged,counts:n}=window.PreproReturn.merge(state,next,info),result=validate(merged);
    const conflicts=n.conflicts.length?'<p>競合（原稿を残します）：'+esc(n.conflicts.join('・'))+'</p>':'';
    if(!n.changed&&!n.added&&!n.removed)return modal('プリプロ名人の変更を反映','<p>反映する変更はありません</p>'+conflicts);
    modal('プリプロ名人の変更を反映','<p>変更 '+n.changed+' ／ 追加 '+n.added+' ／ 削除 '+n.removed+(n.conflicts.length?' ／ 競合 '+n.conflicts.length:'')+'</p>'+conflicts+'<p>反映前の原稿は「保存した原稿」に残します。</p><button id="applyPrepro" class="primary">反映</button><button id="cancelPrepro">キャンセル</button>');
    $('#cancelPrepro').onclick=()=>$('#dialog').close();
    $('#applyPrepro').onclick=async()=>{
      if(snapshot()!==expected){$('#dialog').close();return toast('原稿が変更されたため中止しました。もう一度開いてください。')}
      const keepHandle=handle,keepBaseline=baseline;
      if(!await openDocument(result))return;
      handle=keepHandle;baseline=keepBaseline;try{if(!window.ManuscriptStorage.usingDatabase)localStorage.setItem(baselineKey,baseline)}catch(_){}sync();
      toast('プリプロ名人の変更を反映しました');
    };
  }
  async function saveCommand(asNew=false){
    const captured=snapshot(),epoch=generation,result=await saveFile(asNew);if(result!=='download')return result;
    modal('保存','<button id="confirmFileSaved" class="primary">保存を確認</button><button id="cancelFileSave">キャンセル</button>');
    $('#cancelFileSave').onclick=()=>$('#dialog').close();$('#confirmFileSaved').onclick=()=>{if(epoch===generation){baseline=captured;try{if(!window.ManuscriptStorage.usingDatabase)localStorage.setItem(baselineKey,baseline)}catch(_){}sync()}$('#dialog').close()};return result;
  }
  $('#backup').textContent='保存';$('#backup').setAttribute('aria-label','保存');$('#backup').onclick=()=>saveCommand();$('#saveAs').onclick=()=>saveCommand(true);
  $('#import').onclick=async()=>{
    if(composing||busy)return;
    if(!window.showOpenFilePicker)return $('#file').click();
    // Android providers may label .json as application/octet-stream (BIN).
    // Do not filter the OS picker by MIME; validate the selected contents below.
    const request=++pendingOpen;try{const [picked]=await showOpenFilePicker({multiple:false});await readFile(await picked.getFile(),picked,request)}catch(e){if(e.name!=='AbortError')toast('開けません。現在の作品は保持しています。')}
  };
  const detectSound=p=>({...p,chapters:p.chapters.map(c=>ScriptModel.detectSound(c).chapter)});
  async function readFile(f,picked=null,request=++pendingOpen){
    try{
      const text=(await f.text()).replace(/^\uFEFF/,'');if(request!==pendingOpen)return;
      if(/\.json$/i.test(f.name)||/^[\s]*[\[{]/.test(text)||/json/i.test(f.type)){
        const value=JSON.parse(text);
        if(value&&typeof value==='object'&&value.preproReturn)await receivePrepro(value);
        else await requestOpen(detectSound(validate(value)),/\.json$/i.test(f.name)?picked:null);
      }
      else{
        if(!/\.(txt|md)$/i.test(f.name)||loadBlocked)throw Error('未対応の形式');
        const c=ScriptModel.importChapter({id:uid(),title:f.name.replace(/\.(txt|md)$/i,''),status:'未着手',text});
        const incoming=validate({...initial,...projectPreferences(),title:c.title,chapters:[c]});
        await requestOpen(detectSound(incoming));
      }
    }catch(_){toast('開けません。現在の作品は保持しています。')}
  }
  // Dropped files use the same validation and unsaved-change confirmation as 開く.
  const fileDrag=e=>[...(e.dataTransfer?.types||[])].includes('Files');
  addEventListener('dragover',e=>{if(!fileDrag(e))return;e.preventDefault();e.dataTransfer.dropEffect=composing||busy?'none':'copy'},true);
  addEventListener('drop',e=>{if(!fileDrag(e))return;e.preventDefault();e.stopPropagation();const f=e.dataTransfer.files[0];if(f&&!composing&&!busy)readFile(f)},true);
  $('#file').onchange=async e=>{const f=e.target.files[0];if(f)await readFile(f);e.target.value=''};
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'&&!composing&&!e.isComposing){e.preventDefault();saveCommand(e.shiftKey)}});
  window.FileControls={saveFile:saveCommand,fileChanged,markSaved,requestOpen,documentOpened,sync};sync();
})();
