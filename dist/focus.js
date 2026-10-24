// App focus mode and browser fullscreen are intentionally separate states.
(()=>{
  const controls=$('#focusControls'),exit=$('#exitFocus'),previous=$('#previousChapter'),next=$('#nextChapter');
  const preferenceKey=KEY+'-view-options-v1';
  let pinchEnabled=false,gesture=null,wasFullscreen=false;
  try{pinchEnabled=JSON.parse(localStorage.getItem(preferenceKey)||'{}').pinchFocus===true}catch(_){}
  const focused=()=>document.body.classList.contains('focus')||!!document.fullscreenElement;
  function sync(){
    const on=focused();controls.hidden=!on;$('#focusFooter').hidden=!on;if(on)window.LayoutControls?.syncFocusPlacement();
    document.body.classList.toggle('browser-fullscreen',!!document.fullscreenElement);
    $('#focus').setAttribute('aria-pressed',String(document.body.classList.contains('focus')));
    $('#focusGesture').hidden=!pinchEnabled;
    const i=state.chapters.findIndex(c=>c.id===active);
    previous.disabled=i<=0;next.disabled=i>=state.chapters.length-1;
    $('#focusChapter').textContent=(i+1)+' / '+state.chapters.length+'　'+chapter().title;
  }
  function setFocus(on){document.body.classList.toggle('focus',on);document.body.classList.remove('mobilemenu');sync();if(on)$('#editor').focus()}
  function toggle(){if(!composing&&!$('#dialog').open)setFocus(!document.body.classList.contains('focus'))}
  async function leave(){
    setFocus(false);
    if(document.fullscreenElement)try{await document.exitFullscreen()}catch(_){toast('全画面を解除できませんでした。ブラウザの全画面解除をお試しください。')}
    sync();$('#editor').focus();
  }
  function move(step){
    if(composing||loadBlocked||$('#dialog').open||!focused())return false;
    const index=state.chapters.findIndex(c=>c.id===active),target=state.chapters[index+step];
    if(!target)return false;
    // A failed save keeps the current editor and its unsaved text intact.
    if(dirty){save();if(dirty){toast('保存できないため章の移動を中止しました。');return false}}
    active=target.id;render();sync();$('#editor').focus();return true;
  }
  previous.onclick=()=>move(-1);next.onclick=()=>move(1);exit.onclick=leave;
  $('#browserFullscreen').onclick=async()=>{
    if(composing||$('#dialog').open)return;
    setFocus(true);
    if(!document.documentElement.requestFullscreen){toast('このブラウザでは集中モードを利用できます。');return}
    try{await document.documentElement.requestFullscreen()}catch(_){toast('全画面が許可されないため集中モードを利用します。')}
    sync();
  };
  document.addEventListener('fullscreenchange',()=>{
    if(wasFullscreen&&!document.fullscreenElement)setFocus(false);
    wasFullscreen=!!document.fullscreenElement;sync();
  });
  document.addEventListener('keydown',e=>{
    if(composing||e.isComposing||e.keyCode===229||$('#dialog').open)return;
    if(e.key==='Escape'){sync();return}
    const target=e.target;
    if(target!==document.body&&target!==$('#editor')&&!target.closest?.('#editor,#focusControls,#focusFooter'))return;
    if(focused()&&e.altKey&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&['PageUp','PageDown'].includes(e.key)){
      e.preventDefault();if(!e.repeat)move(e.key==='PageUp'?-1:1);
    }
  });
  const originalSettings=$('#settings').onclick;
  $('#settings').onclick=()=>{
    originalSettings();
    const label=document.createElement('label'),input=document.createElement('input');
    input.type='checkbox';input.id='pinchFocusToggle';input.checked=pinchEnabled;
    label.append(input,document.createTextNode(' 専用領域のピンチで集中モードを切り替える'));
    const note=document.createElement('p');note.textContent='「集中モード操作」の領域だけが対象です。本文では通常のピンチズームを使えます。';
    $('#dialogBody').append(label,note);
    input.onchange=()=>{
      const enabled=input.checked;
      try{localStorage.setItem(preferenceKey,JSON.stringify({pinchFocus:enabled}));pinchEnabled=enabled;sync()}
      catch(_){input.checked=pinchEnabled;toast('操作設定を保存できませんでした。')}
    };
  };
  const handle=$('#focusGesture');
  const distance=touches=>Math.hypot(touches[0].clientX-touches[1].clientX,touches[0].clientY-touches[1].clientY);
  handle.addEventListener('touchstart',e=>{
    if(!pinchEnabled||composing||$('#dialog').open||e.touches.length!==2){gesture=null;return}
    const start=distance(e.touches);gesture=start>=24?{start,last:start,time:performance.now(),ids:[...e.touches].map(t=>t.identifier)}:null;
  },{passive:true});
  handle.addEventListener('touchmove',e=>{
    if(!gesture)return;
    if(e.touches.length!==2||[...e.touches].some(t=>!gesture.ids.includes(t.identifier))){gesture=null;return}
    gesture.last=distance(e.touches);
  },{passive:true});
  handle.addEventListener('touchcancel',()=>gesture=null,{passive:true});
  handle.addEventListener('touchend',e=>{
    if(!gesture)return;const g=gesture;gesture=null;
    if(e.touches.length>1||composing||$('#dialog').open||performance.now()-g.time>1500||Math.abs(g.last-g.start)<24)return;
    if(g.last/g.start>=1.35)setFocus(true);
    else if(g.last/g.start<=.7){if(document.fullscreenElement)leave();else setFocus(false)}
  },{passive:true});
  // Only this explicit, opt-in handle owns touch gestures; the editor keeps browser zoom.
  window.FocusNavigation={toggle,sync,move};sync();
})();
