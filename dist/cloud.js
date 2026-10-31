/* Cloud script sync with プリプロ名人 (the same account, the same cloud copy of each work).
   Signing in is needed for the cloud only; local work never depends on it. A work goes up only when the user
   registers it and keeps a fixed link ID (state.cloudLinkId). Whether THIS device syncs is kept on the device.
   Changes from the cloud apply on their own only when nothing here could be lost; otherwise they wait for the user. */
(()=>{
  // the cloud lives with プリプロ名人 (one database for both apps)
  const API=/^(localhost|127\.0\.0\.1)$/.test(location.hostname)&&localStorage.getItem('togaki.cloud.api')||'https://prepro-meijin.pikoponpoko.workers.dev';
  const SESSION='togaki.cloud.session',LINKS='togaki.cloud.links';
  const read=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))||d}catch(_){return d}};
  const write=(k,v)=>{try{if(v==null)localStorage.removeItem(k);else localStorage.setItem(k,JSON.stringify(v))}catch(_){}};
  const session=()=>read(SESSION,null),links=()=>read(LINKS,{});
  const linkState=id=>(id&&links()[id])||null;
  function setLink(id,patch){const all=links();if(patch)all[id]={...(all[id]||{}),...patch};else delete all[id];write(LINKS,all)}
  const MESSAGES={'not-configured':'クラウド同期は未設定です',offline:'クラウドに接続できません','signed-out':'ログインが切れました。もう一度ログインしてください',
    deleted:'クラウドから削除されています','not-found':'クラウドに作品がありません','bad-code':'連携コードが違うか、期限が切れています',
    'too-large':'脚本が大きすぎます','bad-token':'Googleのログインを確認できませんでした',stale:'ほかの端末の更新と重なりました。もう一度同期してください',
    'bad-script':'クラウドの脚本を読み込めません'};
  const message=e=>MESSAGES[e?.code]||MESSAGES[e?.message]||'クラウドに接続できません';
  class CloudError extends Error{constructor(code,status,extra){super(code);this.code=code;this.status=status;this.extra=extra||{}}}
  async function api(path,{method='GET',body,auth=true}={}){
    const headers={};if(body!==undefined)headers['Content-Type']='application/json';
    const used=auth?session():null;
    if(auth){if(!used)throw new CloudError('signed-out',401);headers.Authorization='Bearer '+used.token}
    let r;try{r=await fetch(API+'/api/cloud'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'})}catch(_){throw new CloudError('offline',0)}
    let data=null;try{data=await r.json()}catch(_){}
    if(!r.ok||!data){
      const code=data?.error||(r.status===404?'not-configured':'offline');
      if(code==='signed-out'&&session()?.token===used?.token)write(SESSION,null);
      throw new CloudError(code,r.status,data);
    }
    return data;
  }
  let config=null;
  async function cloudConfig(){if(config?.enabled)return config;try{config=await api('/config',{auth:false})}catch(e){config={enabled:false,error:e.code}}return config}

  // ---- the cloud copy this device last synced (base of the three-way comparison) ----
  const bases=new Promise(resolve=>{try{const r=indexedDB.open('togaki-cloud-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('bases',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=r.onblocked=()=>resolve(null)}catch(_){resolve(null)}});
  async function saveBase(id,rev,doc){const db=await bases;if(!db)return;await new Promise(res=>{try{const tx=db.transaction('bases','readwrite');tx.objectStore('bases').put({id,rev,raw:JSON.stringify(doc)});tx.oncomplete=tx.onerror=tx.onabort=()=>res()}catch(_){res()}})}
  async function loadBase(id,rev){
    if(rev==null)return null;
    const db=await bases;
    const row=db&&await new Promise(res=>{try{const q=db.transaction('bases').objectStore('bases').get(id);q.onsuccess=()=>res(q.result);q.onerror=()=>res(null)}catch(_){res(null)}});
    if(row?.rev===rev)try{return JSON.parse(row.raw)}catch(_){}
    // not kept here: the cloud keeps its recent revisions
    try{return readCloud((await api('/works/'+encodeURIComponent(id)+'/revisions/'+rev)).body)}catch(_){return null}
  }
  // a cloud copy as a manuscript: the notes of a file return are not part of it
  function readCloud(body){const v={...body};delete v.preproReturn;try{return validate(v)}catch(_){throw new CloudError('bad-script',0)}}

  // ---- state ----
  let syncing=false,lastInput=0,fresh=false,applying=false,lastKey=null;
  const linkId=()=>!loadBlocked&&typeof state.cloudLinkId==='string'&&state.cloudLinkId?state.cloudLinkId:null;
  function setProjectLink(id){if(id)state.cloudLinkId=id;else delete state.cloudLinkId;changed()}
  // replace the manuscript by a merged one: kept in the undo history, caret and scroll kept where they were
  function apply(next){
    const ed=$('#editor'),focused=document.activeElement===ed,sel=focused?historySelection():null,w=$('#writing'),scroll=[w.scrollTop,w.scrollLeft,ed.scrollTop,ed.scrollLeft];
    state=next;if(!state.chapters.some(c=>c.id===active))active=state.chapters[0].id;
    render();[w.scrollTop,w.scrollLeft,ed.scrollTop,ed.scrollLeft]=scroll;if(sel)restoreHistorySelection(sel);changed();
  }

  // ---- conflicts ----
  const FIELDS={title:'作品名',author:'作者',date:'日付',draft:'稿'};
  function chooseConflicts(conflicts){
    return new Promise(resolve=>{
      let done=false;const finish=v=>{if(done)return;done=true;resolve(v)};
      show('クラウドとの競合','<p>選ばなかった方は履歴と「保存した原稿」に残ります。</p><div id="cloudConflicts"></div><div class="cloudRow"><button id="cloudAllLocal">すべてこの端末</button><button id="cloudAllCloud">すべてクラウド</button></div><button id="cloudApplyChoice" class="primary">反映</button><button id="cloudCancelChoice">キャンセル</button>');
      const box=$('#cloudConflicts');
      for(const c of conflicts){
        const row=document.createElement('div');row.className='cloudConflict';
        const head=document.createElement('div');head.className='cloudConflictHead';
        head.textContent=c.type==='info'?FIELDS[c.field]:c.type==='title'?'章のタイトル':(c.chapter+'　'+c.label+(c.type==='removed'?'（クラウドで削除）':c.type==='deleted'?'（この端末で削除）':''));
        const pick=document.createElement('select');pick.dataset.id=c.id;pick.setAttribute('aria-label',head.textContent);
        pick.innerHTML='<option value="local">この端末</option><option value="cloud">クラウド</option>';
        const both=document.createElement('div');both.className='cloudVersions';
        for(const [label,text] of [['この端末',c.local],['クラウド',c.cloud]]){const v=document.createElement('div');const b=document.createElement('b');b.textContent=label;const t=document.createElement('span');t.textContent=text||'（なし）';v.append(b,t);both.append(v)}
        row.append(head,pick,both);box.append(row);
      }
      const all=v=>box.querySelectorAll('select').forEach(s=>s.value=v);
      $('#cloudAllLocal').onclick=()=>all('local');$('#cloudAllCloud').onclick=()=>all('cloud');
      $('#cloudCancelChoice').onclick=()=>{finish(null);$('#dialog').close()};
      $('#cloudApplyChoice').onclick=()=>finish(Object.fromEntries([...box.querySelectorAll('select')].map(s=>[s.dataset.id,s.value])));
      $('#dialog').addEventListener('close',()=>finish(null),{once:true});
    });
  }

  // ---- one sync ----
  // auto: nothing asked. Incoming changes apply on their own only when there is no conflict;
  // otherwise they wait (state.review) until the user syncs from the dialog.
  async function syncNow({auto=false}={}){
    const id=linkId(),st=linkState(id);
    if(!id||!st?.on||!session()||syncing||composing||appRoot.inert)return {skipped:true};
    syncing=true;refreshButton();
    try{
      for(let attempt=0;attempt<3;attempt++){
        const cloud=await api('/works/'+encodeURIComponent(id)).catch(e=>{
          if(e.code==='deleted')setLink(id,{on:false,deleted:e.extra.deleted||new Date().toISOString(),review:null});
          if(e.code==='not-found')setLink(id,{on:false,review:null});throw e});
        if(linkId()!==id)return {skipped:true};
        // the .vconte プリプロ名人 last synced from (shown to tell which version the cloud holds)
        if('file' in cloud)setLink(id,{file:cloud.file});
        const C=readCloud(cloud.body),known=linkState(id)?.rev??null,B=known===cloud.revision?C:await loadBase(id,known);
        // a manuscript opened from a file or the saved list may be older: it goes up only when the user syncs
        if(auto&&fresh&&B&&CloudModel.scriptKey(state)!==CloudModel.scriptKey(B)){setLink(id,{review:'opened'});return {review:true}}
        if(cloud.revision!==known||!B){
          let m=CloudModel.merge(B,state,C);
          if(m.conflicts.length){
            if(auto){setLink(id,{review:cloud.revision});return {review:true}}
            const before=JSON.stringify(state),choices=await chooseConflicts(m.conflicts);
            if(!choices)return {cancelled:true};
            if(JSON.stringify(state)!==before||linkId()!==id)continue;
            m=CloudModel.merge(B,state,C,choices);
            const next=validate(m.next);
            // taking the cloud over something written here: the manuscript before goes to 保存した原稿 first
            if(Object.values(choices).includes('cloud')){applying=true;try{if(!await window.FileControls.keepConnection(()=>openDocument(next)))return {cancelled:true}}finally{applying=false}}
            else if(CloudModel.scriptKey(next)!==CloudModel.scriptKey(state))apply(next);
          }else{
            const next=validate(m.next);
            if(CloudModel.scriptKey(next)!==CloudModel.scriptKey(state)){apply(next);if(auto)toast('クラウドの脚本を反映しました')}
          }
          await saveBase(id,cloud.revision,C);setLink(id,{rev:cloud.revision,review:null,synced:new Date().toISOString()});
        }
        fresh=false;
        const up=CloudModel.outgoing(validate(JSON.parse(JSON.stringify(state))),id);
        if(CloudModel.scriptKey(up)===CloudModel.scriptKey(C)){lastKey=CloudModel.scriptKey(state);setLink(id,{review:null,synced:new Date().toISOString()});return {revision:cloud.revision,sent:false}}
        try{
          const r=await api('/works/'+encodeURIComponent(id),{method:'PUT',body:{baseRevision:cloud.revision,title:up.title||cloud.title,body:up,app:'ohanashi'}});
          await saveBase(id,r.revision,readCloud(up));setLink(id,{rev:r.revision,review:null,synced:r.updated});lastKey=CloudModel.scriptKey(up);
          return {revision:r.revision,sent:true};
        }catch(e){if(e.code!=='stale')throw e}
      }
      throw new CloudError('stale',409);
    }finally{syncing=false;refreshButton()}
  }

  // ---- register / open / stop / delete ----
  async function register(again=false){
    const id=again?linkId():'work_'+crypto.randomUUID().replace(/-/g,'');
    const up=CloudModel.outgoing(validate(JSON.parse(JSON.stringify(state))),id);
    const r=await api('/works',{method:'POST',body:{id,title:up.title,body:up,app:'ohanashi',reRegister:again}});
    if(!again)setProjectLink(id);
    await saveBase(id,r.revision,readCloud(up));setLink(id,{on:true,rev:r.revision,synced:r.updated,deleted:null,review:null});fresh=false;lastKey=CloudModel.scriptKey(state);
  }
  // a work from the cloud opens as the manuscript (the one open now goes to 保存した原稿)
  async function openWork(id){
    if(id===linkId()){setLink(id,{on:true,deleted:null});return syncNow()}
    const w=await api('/works/'+encodeURIComponent(id)),C=readCloud(w.body);
    const next=validate({...C,...projectPreferences(),cloudLinkId:id});
    applying=true;try{if(!await openDocument(next))return}finally{applying=false}
    await saveBase(id,w.revision,C);setLink(id,{on:true,rev:w.revision,file:w.file??null,synced:new Date().toISOString(),deleted:null,review:null});fresh=false;lastKey=CloudModel.scriptKey(state);
    toast('クラウドの作品を開きました');
  }

  // ---- Google sign-in (the app's own button: Google's rendered one changes size while loading) ----
  let gis=null,tokenClient=null,signedInDone=null;
  const loadGis=()=>gis||=new Promise((resolve,reject)=>{
    if(window.google?.accounts?.oauth2)return resolve(window.google.accounts.oauth2);
    const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;
    s.onload=()=>resolve(window.google.accounts.oauth2);s.onerror=()=>{gis=null;reject(new CloudError('offline',0))};document.head.append(s);
  });
  async function prepareLogin(){
    const oauth2=await loadGis();
    tokenClient||=oauth2.initTokenClient({client_id:config.clientId,scope:'openid email profile',callback:async resp=>{
      if(resp.error||!resp.access_token)return toast(MESSAGES['bad-token']);
      try{const r=await api('/login',{method:'POST',body:{accessToken:resp.access_token},auth:false});write(SESSION,{token:r.token,user:r.user,expires:r.expires});signedInDone?.()}
      catch(e){toast(message(e))}
    }});
  }

  // ---- the dialog ----
  const when=t=>t?new Date(t).toLocaleString('ja-JP'):'';
  function show(title,html){$('#dialogTitle').textContent=title;$('#dialogBody').innerHTML=html;if(!$('#dialog').open)$('#dialog').showModal()}
  const button=(label,fn,cls='')=>{const b=document.createElement('button');b.textContent=label;if(cls)b.className=cls;b.onclick=async()=>{b.disabled=true;let page=false;try{page=await fn()==='page'}catch(e){toast(message(e))}finally{b.disabled=false;if(!page&&$('#dialog').open&&$('#dialog').dataset.cloud)renderDialog()}};return b};
  // a function answering 'page' has put its own page in the dialog
  const row=(...nodes)=>{const r=document.createElement('div');r.className='cloudRow';r.append(...nodes);return r};
  const text=(s,cls)=>{const p=document.createElement('p');p.textContent=s;if(cls)p.className=cls;return p};
  async function renderDialog(){
    show('クラウド同期','<p>…</p>');$('#dialog').dataset.cloud='1';
    const body=$('#dialogBody'),cfg=await cloudConfig();
    if(!$('#dialog').dataset.cloud)return;
    if(!cfg.enabled)return body.replaceChildren(text(MESSAGES[cfg.error]||MESSAGES['not-configured']));
    const s=session();
    if(!s){
      try{await prepareLogin();body.replaceChildren(button('Googleでログイン',()=>{signedInDone=()=>{if($('#dialog').dataset.cloud)renderDialog()};tokenClient.requestAccessToken({prompt:''});return 'page'},'primary'))}
      catch(e){body.replaceChildren(text(message(e)))}
      return;
    }
    const account=row(Object.assign(document.createElement('span'),{className:'cloudUser',textContent:s.user?.email||s.user?.name||''}),button('ログアウト',async()=>{try{await api('/logout',{method:'POST'})}catch(_){}write(SESSION,null)}));account.className='cloudAccount';
    const out=[account];
    // which manuscript this is: its file when one is connected, else its title
    out.push(text(window.FileControls.fileName?.()||state.title||'無題','cloudName'));
    const id=linkId(),st=linkState(id)||{};
    if(!id){
      out.push(button('この作品をクラウドに登録',()=>register(),'primary'),row(button('クラウドの作品を開く…',pickWork),button('連携コードで開く…',enterCode)));
    }else if(st.deleted){
      out.push(text('クラウドから削除済み（'+when(st.deleted)+'）'),button('クラウドに再登録',()=>register(true),'primary'));
    }else if(st.on){
      out.push(text(st.review==='opened'?'開いた原稿がクラウドと違います':st.review?'クラウドの変更が確認待ちです':st.synced?'同期 '+when(st.synced)+(st.rev?'・r'+st.rev:'')+(st.file?'・'+st.file:''):'未同期'),
        button('今すぐ同期',async()=>{const r=await syncNow();if(r?.revision)toast('同期しました')},'primary'),
        row(button('連携コードを発行',()=>showCode(id)),button('履歴…',()=>showHistory(id))),
        row(button('この端末で同期を停止',async()=>setLink(id,{on:false,review:null})),button('クラウドから削除…',()=>removeCloud(id))));
    }else{
      out.push(text('この端末では同期していません'),button('この端末で同期を開始',async()=>{setLink(id,{on:true});await syncNow()},'primary'),
        row(button('クラウドから削除…',()=>removeCloud(id))));
    }
    // another work can be opened from any state (the manuscript open now goes to 保存した原稿)
    if(id)out.push(row(button('クラウドの作品を開く…',pickWork),button('連携コードで開く…',enterCode)));
    body.replaceChildren(...out);refreshButton();
  }
  // sub-pages of the dialog come back to it
  const back=()=>{const b=document.createElement('button');b.textContent='戻る';b.onclick=()=>renderDialog();return b};
  async function pickWork(){
    const {works}=await api('/works');
    if(!works.length)return toast('クラウドに作品がありません');
    show('クラウドの作品を開く','');
    for(const w of works){
      const r=document.createElement('div');r.className='archiveRow';
      const open=document.createElement('button');open.className='archiveOpen';open.textContent=(w.title||'無題')+' · '+when(w.updated);
      open.onclick=async()=>{try{await openWork(w.id);if(linkId()===w.id)renderDialog()}catch(e){toast(message(e))}};
      r.append(open);$('#dialogBody').append(r);
    }
    $('#dialogBody').append(back());
    return 'page';
  }
  async function enterCode(){
    show('連携コード','<input id="cloudCodeInput" maxlength="12" autocomplete="off" spellcheck="false" aria-label="連携コード"><button id="cloudRedeem" class="primary">開く</button>');
    $('#dialogBody').append(back());
    $('#cloudRedeem').onclick=async()=>{try{const w=await api('/codes/redeem',{method:'POST',body:{code:$('#cloudCodeInput').value}});await openWork(w.id);renderDialog()}catch(e){toast(message(e))}};
    return 'page';
  }
  async function showCode(id){
    const r=await api('/works/'+encodeURIComponent(id)+'/code',{method:'POST'});
    show('連携コード','');$('#dialogBody').append(text(r.code,'cloudCode'),text('有効期限 '+when(r.expires)+'・1回限り・同じGoogleアカウントでのみ使えます'),back());
    return 'page';
  }
  async function showHistory(id){
    const {revisions}=await api('/works/'+encodeURIComponent(id)+'/revisions');
    show('クラウドの履歴','');
    for(const v of revisions){
      const r=document.createElement('div');r.className='archiveRow';
      const label=document.createElement('span');label.className='archiveOpen';label.textContent='r'+v.revision+'　'+when(v.updated)+'　'+(v.app==='ohanashi'?'Togaki':v.app==='prepro'?'プリプロ名人':'');
      const save=document.createElement('button');save.textContent='JSON';save.setAttribute('aria-label','r'+v.revision+'のJSONを保存');
      save.onclick=async()=>{try{const x=await api('/works/'+encodeURIComponent(id)+'/revisions/'+v.revision);download(JSON.stringify(x.body,null,2),'json','application/json')}catch(e){toast(message(e))}};
      r.append(label,save);$('#dialogBody').append(r);
    }
    $('#dialogBody').append(back());
    return 'page';
  }
  async function removeCloud(id){
    show('クラウドから削除','<p>クラウド上のこの作品の脚本を削除し、すべての端末で同期を止めます。この端末と他の端末の原稿・プリプロ名人の作品ファイルはそのまま残ります。</p><button id="cloudConfirmDelete" class="primary">削除</button>');
    $('#dialogBody').append(back());
    $('#cloudConfirmDelete').onclick=async()=>{try{const r=await api('/works/'+encodeURIComponent(id),{method:'DELETE'});setLink(id,{on:false,deleted:r.deleted,review:null});renderDialog()}catch(e){toast(message(e))}};
    return 'page';
  }

  // ---- footer button and background ----
  function refreshButton(){
    const b=$('#cloud');if(!b)return;
    const id=linkId(),st=linkState(id),on=!!st?.on&&!!session();
    b.classList.toggle('on',on);
    $('#cloudState').textContent=on&&st.review?'確認待ち':'';
    b.title=!id?'クラウド同期':st?.deleted?'クラウドから削除済み':!on?'この端末では同期していません':syncing?'同期中':st.review?'クラウドの変更が確認待ちです':st.synced?'同期 '+when(st.synced):'クラウド同期';b.setAttribute('aria-label',b.title);
  }
  $('#cloud').onclick=()=>renderDialog();
  $('#dialog').addEventListener('close',()=>{delete $('#dialog').dataset.cloud});
  $('#editor').addEventListener('input',()=>{lastInput=Date.now()});
  $('#editor').addEventListener('keydown',()=>{lastInput=Date.now()});
  let lastRemote=0;
  async function tick(force=false){
    const id=linkId(),st=linkState(id);
    if(!id||!st?.on||!session()||document.hidden||$('#dialog').open||composing||syncing||st.review||Date.now()-lastInput<4000)return;
    const localChanged=lastKey!==CloudModel.scriptKey(state),remoteDue=force||Date.now()-lastRemote>60_000;
    if(!localChanged&&!remoteDue)return;
    try{
      if(!localChanged){lastRemote=Date.now();const m=await api('/works/'+encodeURIComponent(id)+'?meta');if(m.revision===linkState(id)?.rev)return}
      else lastRemote=Date.now();
      await syncNow({auto:true});
    }catch(e){if(['deleted','not-found'].includes(e.code))toast(message(e));refreshButton()}
  }
  setInterval(()=>tick(),20_000);
  window.addEventListener('online',()=>tick(true));window.addEventListener('focus',()=>tick(true));
  // another manuscript opened (a file, a saved one, a return from プリプロ名人): checked before anything goes up
  window.CloudSync={documentOpened(){if(!applying){fresh=true;lastKey=null}refreshButton()},syncNow,merge:CloudModel.merge};
  window.manuscriptReady?.then(()=>{refreshButton();setTimeout(()=>tick(true),1500)});
})();
