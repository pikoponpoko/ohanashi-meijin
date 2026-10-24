// Snapshots are kept separately; the existing active-document key and v2 schema stay compatible.
const ARCHIVE_PREFIX=KEY+'-document-';
function archivedDocuments(){
  const docs=[];
  for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i);if(!key?.startsWith(ARCHIVE_PREFIX))continue;
    try{const entry=JSON.parse(localStorage.getItem(key));if(typeof entry.raw==='string')docs.push({key,...entry})}catch(_){}
  }
  return docs.sort((a,b)=>b.savedAt.localeCompare(a.savedAt));
}
function syncArchives(){try{$('#savedDocuments').hidden=archivedDocuments().length===0}catch(_){$('#savedDocuments').hidden=true}}
function openDocument(next){
  if(composing)return false;
  try{
    next=validate(next);
    const raw=loadBlocked?localStorage.getItem(KEY):JSON.stringify(validate(state));
    const archived={raw:raw??'',title:loadBlocked?'読み取れない原稿':state.title||'無題',savedAt:new Date().toISOString()};
    // Both writes must succeed before changing the in-memory document.
    localStorage.setItem(ARCHIVE_PREFIX+uid(),JSON.stringify(archived));
    localStorage.setItem(KEY,JSON.stringify(next));
  }catch(_){syncArchives();toast('現在の原稿を残せないため、切り替えを中止しました。');return false}
  clearTimeout(timer);state=next;active=state.chapters[0].id;loadBlocked=false;dirty=false;
  window.FileControls?.documentOpened();resetHistory();render();syncArchives();$('#saved').textContent='ブラウザに保存済み';$('#dialog').close();document.body.classList.remove('mobilemenu');return true;
}
$('#newDocument').onclick=()=>{
  modal('新しい作品','<p>現在の原稿はこのブラウザに残します。</p><button id="confirmNewDocument" class="primary">空白から始める</button>');
  $('#confirmNewDocument').onclick=()=>{
    const next=validate({...initial,date:today(),font:state.font,size:state.size,printSize:state.printSize,direction:state.direction,dark:state.dark,chapters:[{id:uid(),title:'新しい章',status:'未着手',text:''}]});
    next.chapters=next.chapters.map(ScriptModel.removeBlankLines);openDocument(next);
  };
};
$('#savedDocuments').onclick=()=>{
  let docs;try{docs=archivedDocuments()}catch(_){return toast('保存した原稿を読み込めません。')}
  modal('保存した原稿','');
  for(const entry of docs){
    const row=document.createElement('div');row.className='archiveRow';
    const open=document.createElement('button');open.className='archiveOpen';open.textContent=entry.title+' · '+new Date(entry.savedAt).toLocaleString('ja-JP');
    open.onclick=()=>{try{openDocument(validate(JSON.parse(entry.raw)))}catch(_){toast('原稿を読み込めません。JSONを保存して確認してください。')}};
    const backup=document.createElement('button');backup.textContent='JSON';backup.setAttribute('aria-label',entry.title+'のJSONを保存');backup.onclick=()=>download(entry.raw,'json','application/json');
    row.append(open,backup);$('#dialogBody').append(row);
  }
};
syncArchives();
