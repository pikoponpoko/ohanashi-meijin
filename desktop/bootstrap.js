(()=>{
  const bridge=window.ohanashiDesktop;
  if(!bridge)return;
  const set=Storage.prototype.setItem;
  function handle(selected){
    return {name:selected.name,kind:'file',async getFile(){return new File([await bridge.readFile(selected.token)],selected.name)},async createWritable(){
      let content='',aborted=false;
      return {async write(value){if(typeof value!=='string')throw Error('Unsupported content');content=value},async close(){if(!aborted)await bridge.writeFile(selected.token,content)},async abort(){aborted=true}};
    }};
  }
  window.showSaveFilePicker=async options=>{
    const selected=await bridge.chooseSave(options?.suggestedName);
    if(!selected)throw new DOMException('Cancelled','AbortError');return handle(selected);
  };
  window.showOpenFilePicker=async()=>{
    const selected=await bridge.chooseOpen();
    if(!selected)throw new DOMException('Cancelled','AbortError');return [handle(selected)];
  };
  let failure='';
  try{
    const result=bridge.readBackup();
    if(!result.ok)throw Error(result.error);
    // Restore only an empty profile. Existing/corrupt manuscript bytes win.
    if(localStorage.length===0&&result.value){
      for(const [key,value] of Object.entries(result.value))set.call(localStorage,key,value);
    }
  }catch(e){failure='保存データの予備コピーを読めませんでした。既存データは保持しています。'}
  Storage.prototype.setItem=function(key,value){
    set.call(this,key,value);
    if(this===localStorage){
      const result=bridge.persistStorage({...localStorage});
      if(!result.ok)throw Error(result.error);
    }
  };
  addEventListener('DOMContentLoaded',()=>{
    document.querySelector('#installApp')?.setAttribute('hidden','');
    const button=document.createElement('button');button.textContent='アップデートを確認';
    button.id='desktopUpdates';button.onclick=()=>bridge.checkUpdates().catch(()=>toast('配布ページを開けませんでした。'));
    document.querySelector('.footerActions').append(button);
    if(failure)toast(failure);
  });
  addEventListener('beforeunload',event=>{
    // Commit a pending autosave before a normal window close.
    if(typeof dirty!=='undefined'&&dirty&&!composing){capture();save()}
    if(typeof dirty!=='undefined'&&(dirty||composing)){event.preventDefault();event.returnValue=false}
  });
})();
