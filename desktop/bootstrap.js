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
  const click=HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click=function(){
    if(!this.download||!this.href.startsWith('blob:'))return click.call(this);
    fetch(this.href).then(response=>response.arrayBuffer()).then(data=>bridge.saveDownload(this.download,data)).catch(()=>toast('ファイルを保存できませんでした。'));
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
  try{
    const result=bridge.readDatabaseBackup();
    if(!result.ok)throw Error(result.error);
    // Opened before persistence.js, so its open waits for this upgrade.
    // Only a missing database is filled; existing rows always win.
    if(result.value){
      const request=indexedDB.open('ohanashi-manuscripts-v1',1);
      request.onupgradeneeded=event=>{
        const store=request.result.createObjectStore('records',{keyPath:'key'});
        if(event.oldVersion===0)for(const row of result.value)store.put(row);
      };
      request.onsuccess=()=>request.result.close();
    }
  }catch(e){failure='保存データの予備コピーを読めませんでした。既存データは保持しています。'}
  const sent=new Set();
  async function persistDatabase(storage){
    const rows=[{key:'active',raw:storage.activeRaw},...storage.archives.filter(row=>!sent.has(row.key))];
    await bridge.persistDatabase(rows);
    for(const row of rows)if(row.key!=='active')sent.add(row.key);
  }
  let manuscriptStorage;
  Object.defineProperty(window,'ManuscriptStorage',{configurable:true,get:()=>manuscriptStorage,set(storage){
    const commit=storage.commit;
    storage.commit=async(...args)=>{await commit(...args);await persistDatabase(storage)};
    storage.ready.then(()=>{if(typeof storage.activeRaw==='string')return persistDatabase(storage)}).catch(()=>toast('保存データの予備コピーを書けませんでした。'));
    manuscriptStorage=storage;
  }});
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
