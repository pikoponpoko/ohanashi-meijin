/* Paragraph-kind shortcuts the user can rebind, F1 for settings, and the settings dialog tabs. */
(function(){
  const VERSION='0.1.12';
  const STORE='ohanashi.shortcuts',TAB='ohanashi.settingsTab';
  const ACTIONS=[['scene','柱','Alt+1'],['action','ト書き','Alt+2'],['dialogue','セリフ','Alt+3'],['music','音楽','Alt+4'],['se','SE','Alt+5'],['speaker','話者','']];
  // Keys already used elsewhere in the app or by the editor.
  const RESERVED=new Set(['Ctrl+S','Ctrl+Shift+S','Ctrl+O','Ctrl+E','Ctrl+P','Ctrl+F','Ctrl+H','Ctrl+Z','Ctrl+Y','Ctrl+Shift+Z','Ctrl+A','Ctrl+C','Ctrl+V','Ctrl+X','Ctrl+Shift+F','Ctrl+Shift+D','Alt+PageUp','Alt+PageDown','F1']);
  const defaults=()=>Object.fromEntries(ACTIONS.map(a=>[a[0],a[2]]));
  let keys=defaults(),capture=null;
  try{const saved=JSON.parse(localStorage.getItem(STORE)||'{}');for(const [id] of ACTIONS)if(typeof saved[id]==='string')keys[id]=saved[id]}catch(_){}
  const store=()=>{try{localStorage.setItem(STORE,JSON.stringify(keys));return true}catch(_){toast('ショートカットを保存できませんでした。');return false}};
  function combo(e){
    if(['Control','Alt','Shift','Meta','AltGraph','Process','Unidentified'].includes(e.key))return '';
    const key=/^Digit\d$/.test(e.code)?e.code.slice(5):/^Numpad\d$/.test(e.code)?e.code.slice(6):/^Key[A-Z]$/.test(e.code)?e.code.slice(3):e.key.length===1?e.key.toUpperCase():e.key;
    return [(e.ctrlKey||e.metaKey)&&'Ctrl',e.altKey&&'Alt',e.shiftKey&&'Shift',key].filter(Boolean).join('+');
  }
  const button=id=>id==='speaker'?$('#speaker'):$(`[data-insert="${id}"]`);
  function syncToolbar(){
    for(const [id] of ACTIONS){
      const b=button(id);if(!b)continue;
      b.dataset.baseTitle??=b.title.replace(/ Alt\+\d$/,'');
      b.title=keys[id]?`${b.dataset.baseTitle} ${keys[id]}`:b.dataset.baseTitle;
      if(keys[id])b.setAttribute('aria-keyshortcuts',keys[id].replace('Ctrl','Control'));else b.removeAttribute('aria-keyshortcuts');
      let kbd=b.querySelector('kbd');
      if(!keys[id]){kbd?.remove();continue}
      if(!kbd){kbd=document.createElement('kbd');b.append(' ',kbd)}
      kbd.textContent=/^Alt\+[^+]+$/.test(keys[id])?keys[id].slice(4):keys[id];
    }
  }
  // F1 is taken before any other handler so the browser's help page never opens.
  addEventListener('keydown',e=>{if(e.key!=='F1')return;e.preventDefault();e.stopPropagation();if(!capture&&!composing&&!$('#dialog').open)$('#settings').click()},true);
  addEventListener('help',e=>e.preventDefault());
  document.addEventListener('keydown',e=>{
    if(capture||composing||e.isComposing||e.keyCode===229)return;
    if($('#dialog').open)return;
    const c=combo(e),id=c&&Object.keys(keys).find(k=>keys[k]===c);
    if(!id||!($('#editor').contains(e.target)||e.target===document.body))return;
    if(id==='speaker'){e.preventDefault();$('#speaker').click();return}
    if(editorRange()){e.preventDefault();insert(id)}
  });

  function keysPane(pane){
    const box=document.createElement('div');box.className='shortcutList';
    box.innerHTML=`<label>種別のショートカット</label>${ACTIONS.map(([id,name])=>`<div class="shortcutRow"><span>${name}</span><button type="button" class="shortcutKey" data-key="${id}"></button><button type="button" class="shortcutClear" data-clear="${id}" aria-label="${name}のショートカットを外す" title="外す">×</button></div>`).join('')}<p class="shortcutStatus" role="status"></p><button type="button" id="shortcutReset">初期設定に戻す</button><label>固定のショートカット</label>${[['設定','F1'],['検索と置換','Ctrl+F'],['保存','Ctrl+S'],['集中モード','Ctrl+Shift+F']].map(([n,k])=>`<div class="shortcutRow fixed"><span>${n}</span><span class="shortcutKey">${k}</span><span></span></div>`).join('')}`;
    pane.prepend(box);
    const status=box.querySelector('.shortcutStatus');
    const render=()=>{box.querySelectorAll('[data-key]').forEach(b=>{const id=b.dataset.key;b.textContent=capture?.id===id?'キーを押す':keys[id]||'なし';b.classList.toggle('on',capture?.id===id);b.classList.toggle('empty',!keys[id])});box.querySelectorAll('[data-clear]').forEach(b=>b.hidden=!keys[b.dataset.clear]);syncToolbar()};
    const stop=()=>{if(!capture)return;document.removeEventListener('keydown',capture.listen,true);capture=null;render()};
    box.querySelectorAll('[data-key]').forEach(b=>{
      b.onclick=()=>{
        const id=b.dataset.key;if(capture?.id===id)return stop();stop();status.textContent='';
        const listen=e=>{
          e.preventDefault();e.stopPropagation();
          if(e.key==='Escape')return stop();
          const c=combo(e);if(!c)return;
          if(!/^F([2-9]|1[0-2])$/.test(c)&&!/^(Ctrl|Alt)\+/.test(c)){status.textContent='Ctrl か Alt と組み合わせてください。';return}
          if(RESERVED.has(c)){status.textContent=`${c} はほかの操作で使われています。`;return}
          const other=Object.keys(keys).find(k=>k!==id&&keys[k]===c);
          if(other){keys[other]='';status.textContent=`${ACTIONS.find(a=>a[0]===other)[1]} から ${c} を外しました。`}
          keys[id]=c;store();stop();
        };
        capture={id,listen};document.addEventListener('keydown',listen,true);render();
      };
      b.onblur=()=>setTimeout(()=>{if(capture?.id===b.dataset.key&&document.activeElement!==b)stop()});
    });
    box.querySelectorAll('[data-clear]').forEach(b=>b.onclick=()=>{stop();keys[b.dataset.clear]='';store();status.textContent='';render()});
    box.querySelector('#shortcutReset').onclick=()=>{stop();keys=defaults();store();status.textContent='';render()};
    render();
    return stop;
  }

  function tabs(){
    const body=$('#dialogBody'),list=body.querySelector('.settingsTabs');if(!list)return;
    const show=name=>{
      if(!body.querySelector(`[data-pane="${name}"]`))name='view';
      list.querySelectorAll('[data-tab]').forEach(t=>{const on=t.dataset.tab===name;t.setAttribute('aria-selected',String(on));t.tabIndex=on?0:-1;t.classList.toggle('on',on)});
      body.querySelectorAll('[data-pane]').forEach(p=>p.hidden=p.dataset.pane!==name);
      body.querySelector('.settingsFoot').hidden=name==='keys';
      try{localStorage.setItem(TAB,name)}catch(_){}
    };
    list.querySelectorAll('[data-tab]').forEach(t=>t.onclick=()=>show(t.dataset.tab));
    list.onkeydown=e=>{
      if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();
      const all=[...list.querySelectorAll('[data-tab]')],i=all.findIndex(t=>t.getAttribute('aria-selected')==='true'),next=all[(i+(e.key==='ArrowRight'?1:-1)+all.length)%all.length];
      show(next.dataset.tab);next.focus();
    };
    let saved='view';try{saved=localStorage.getItem(TAB)||'view'}catch(_){}
    show(saved);list.querySelector('[aria-selected="true"]').focus({preventScroll:true});
  }

  const original=$('#settings').onclick;
  $('#settings').onclick=()=>{
    original();
    $('#dialogTitle').innerHTML=`設定<small class="appVersion">Togaki v${VERSION}</small>`;
    const pane=$('#dialogBody [data-pane="keys"]');
    if(pane){const stop=keysPane(pane);$('#dialog').addEventListener('close',stop,{once:true})}
    tabs();
  };
  window.Shortcuts={combo,get keys(){return {...keys}},VERSION};
  syncToolbar();
})();
