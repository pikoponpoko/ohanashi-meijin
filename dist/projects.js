// Snapshots are kept separately; the existing active-document key and v2 schema stay compatible.
const ARCHIVE_PREFIX=KEY+'-document-';
function projectPreferences(){
  return Object.fromEntries(['font','size','printSize','direction','dark','rate','actionSeconds','speechPause','cutPause','timingMode','cover','printColumns'].filter(key=>state[key]!==undefined).map(key=>[key,state[key]]));
}
function archivedDocuments(){
  const docs=window.ManuscriptStorage.archives;
  for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i);if(!key?.startsWith(ARCHIVE_PREFIX))continue;
    try{const entry=JSON.parse(localStorage.getItem(key));if(typeof entry.raw==='string')docs.push({key,...entry})}catch(_){}
  }
  return docs.map(entry=>({...entry,title:typeof entry.title==='string'?entry.title:'無題',savedAt:typeof entry.savedAt==='string'?entry.savedAt:''})).sort((a,b)=>b.savedAt.localeCompare(a.savedAt));
}
function syncArchives(){try{$('#savedDocuments').hidden=archivedDocuments().length===0}catch(_){$('#savedDocuments').hidden=true}}
let switchingDocument=false;
async function openDocument(next){
  await window.manuscriptReady;
  if(composing||switchingDocument)return false;
  switchingDocument=true;clearTimeout(timer);
  appRoot.inert=true;
  try{
    next=validate(next);
    const persisted=window.ManuscriptStorage.usingDatabase?await window.ManuscriptStorage.readRaw():localStorage.getItem(KEY);
    // Preserve even an invalid in-memory draft byte-for-byte before switching.
    const raw=loadBlocked?persisted:JSON.stringify(state);
    const archived={raw:raw??'',title:loadBlocked?'読み取れない原稿':state.title||'無題',savedAt:new Date().toISOString()};
    const snapshots=[archived];
    if(persisted!==null&&persisted!==raw){
      let title='ブラウザ保存済み原稿';try{title=JSON.parse(persisted).title||title}catch(_){}
      snapshots.push({raw:persisted,title,savedAt:archived.savedAt});
    }
    const nextRaw=JSON.stringify(next);
    appRoot.inert=true;
    if(window.ManuscriptStorage.usingDatabase)await window.ManuscriptStorage.commit(nextRaw,snapshots);
    else{
      try{
        // Reopening an identical snapshot does not create duplicate archives.
        const known=new Set(archivedDocuments().map(entry=>entry.raw));
        for(const snapshot of snapshots)if(!known.has(snapshot.raw))localStorage.setItem(ARCHIVE_PREFIX+uid(),JSON.stringify(snapshot));
        localStorage.setItem(KEY,nextRaw);
      }catch(error){
        if(error.name!=='QuotaExceededError')throw error;
        // No existing localStorage data is deleted to make room.
        await window.ManuscriptStorage.commit(nextRaw,snapshots);
      }
    }
  }catch(_){syncArchives();toast('原稿を安全に保存できないため、切り替えを中止しました。「保存」でJSONを残してください。');return false}
  finally{switchingDocument=false;appRoot.inert=false}
  clearTimeout(timer);state=next;active=state.chapters[0].id;loadBlocked=false;dirty=false;
  window.FileControls?.documentOpened();window.CloudSync?.documentOpened();resetHistory();render();syncArchives();$('#saved').textContent='ブラウザに保存済み';$('#dialog').close();document.body.classList.remove('mobilemenu');return true;
}
$('#newDocument').onclick=()=>{
  modal('新しい作品','<p>現在の原稿はこのブラウザに残します。</p><button id="confirmNewDocument" class="primary">空白から始める</button>');
  $('#confirmNewDocument').onclick=()=>{
    const next=validate({...initial,...projectPreferences(),date:today(),chapters:[{id:uid(),title:'新しい章',status:'未着手',text:''}]});
    next.chapters=next.chapters.map(ScriptModel.removeBlankLines);openDocument(next);
  };
};
$('#savedDocuments').onclick=()=>{
  let docs;try{docs=archivedDocuments()}catch(_){return toast('保存した原稿を読み込めません。')}
  modal('保存した原稿','');
  for(const entry of docs){
    const row=document.createElement('div');row.className='archiveRow';
    const date=new Date(entry.savedAt),label=Number.isNaN(date.getTime())?'保存日時不明':date.toLocaleString('ja-JP');
    const open=document.createElement('button');open.className='archiveOpen';open.textContent=entry.title+' · '+label;
    open.onclick=()=>{try{openDocument(validate(JSON.parse(entry.raw)))}catch(_){toast('原稿を読み込めません。JSONを保存して確認してください。')}};
    const backup=document.createElement('button');backup.textContent='JSON';backup.setAttribute('aria-label',entry.title+'のJSONを保存');backup.onclick=()=>download(entry.raw,'json','application/json');
    row.append(open,backup);$('#dialogBody').append(row);
  }
};
syncArchives();
