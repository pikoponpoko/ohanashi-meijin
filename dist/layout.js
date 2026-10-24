// Reuse chapter/progress controls in a compact shell; never rebuild the editor on resize.
(()=>{
  const panel=$('#chapterPanel'),picker=$('#menu');let returnFocus=null;
  function closeChapters(restore=false){panel.hidden=true;document.body.classList.remove('mobilemenu');picker.setAttribute('aria-expanded','false');if(restore)returnFocus?.focus()}
  function toggleChapters(){
    if(!panel.hidden)return closeChapters(true);
    returnFocus=document.activeElement;panel.hidden=false;placePanel();document.body.classList.add('mobilemenu');picker.setAttribute('aria-expanded','true');
  }
  $('#closeChapters').onclick=()=>closeChapters(true);
  // Keep the backdrop through pointerup so a touch cannot click the footer underneath.
  $('#sidebarBackdrop').addEventListener('click',e=>{e.preventDefault();e.stopPropagation();closeChapters()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!composing)closeChapters(true)});
  document.addEventListener('focusin',e=>{if(!panel.hidden&&!panel.contains(e.target)&&!picker.contains(e.target))closeChapters()});
  // Keep a selected passage available for the existing chapter-split action.
  panel.addEventListener('mousedown',e=>{if(e.target.closest('button')&&!e.target.closest('#chapterTitle'))e.preventDefault()});
  function syncFocusPlacement(){
    if(!document.body.classList.contains('focus'))return;
    requestAnimationFrame(()=>{
      const writing=$('#writing'),editor=$('#editor');writing.style.removeProperty('--focus-top');
      const style=getComputedStyle(editor),height=document.body.getBoundingClientRect().height;
      const padding=parseFloat(style.paddingTop)+parseFloat(style.paddingBottom);
      let textHeight=0;
      for(const block of editor.children){
        if(block.dataset.cutId||!block.textContent.trim())continue;
        const range=document.createRange();range.selectNodeContents(block);textHeight=Math.max(textHeight,range.getBoundingClientRect().height);
      }
      textHeight=Math.max(textHeight,parseFloat(style.fontSize));
      const baseline=parseFloat(getComputedStyle(writing).marginTop);
      const maximum=Math.max(baseline,height-64-padding-parseFloat(style.fontSize)*3);
      const top=Math.min(maximum,Math.max(baseline,(height-textHeight)/2-parseFloat(style.paddingTop)));
      writing.style.setProperty('--focus-top',top+'px');
    });
  }
  addEventListener('resize',syncFocusPlacement);
  window.visualViewport?.addEventListener('resize',syncFocusPlacement);
  function placePanel(){
    if(panel.hidden)return;const a=picker.getBoundingClientRect(),v=window.visualViewport;
    const left=v?.offsetLeft||0,top=v?.offsetTop||0,width=v?.width||innerWidth,height=v?.height||innerHeight;
    panel.style.right='auto';panel.style.left=Math.max(left+8,Math.min(a.left,left+width-panel.offsetWidth-8))+'px';
    const y=Math.max(top+8,Math.min(a.bottom+6,top+height-100));panel.style.top=y+'px';panel.style.maxHeight=Math.max(80,top+height-y-8)+'px';
  }
  addEventListener('resize',placePanel);window.visualViewport?.addEventListener('resize',placePanel);window.visualViewport?.addEventListener('scroll',placePanel);
  function syncChapterOrder(){const i=state.chapters.findIndex(c=>c.id===active);$('#chapterNumber').textContent='CHAPTER '+String(i+1).padStart(2,'0')}
  function reorderChapter(id,target){
    if(composing||loadBlocked||$('#dialog').open)return false;
    const i=state.chapters.findIndex(c=>c.id===id),j=state.chapters.findIndex(c=>c.id===target);if(i<0||j<0||i===j)return false;
    if(dirty){save();if(dirty)return false}
    const [c]=state.chapters.splice(i,1);state.chapters.splice(j,0,c);ScriptModel.renumber(state);recordHistory();save();renderNav();syncCutLabels();stats();window.FocusNavigation?.sync();return true;
  }
  let drag=null,keyboardId=null;
  const nav=$('#chapters');
  function clearDrag(){nav.querySelectorAll('.dragTarget').forEach(e=>e.classList.remove('dragTarget'));nav.querySelectorAll('.chapterHandle').forEach(e=>e.setAttribute('aria-pressed','false'));drag=null}
  nav.addEventListener('pointerdown',e=>{
    const handle=e.target.closest('.chapterHandle');if(!handle||composing||loadBlocked)return;
    e.preventDefault();handle.focus();keyboardId=null;drag={id:handle.parentElement.dataset.chapterId,target:null,x:e.clientX,y:e.clientY,baseline:JSON.stringify(state),pointer:e.pointerId};handle.setPointerCapture(e.pointerId);
  });
  nav.addEventListener('pointermove',e=>{
    if(!drag||drag.pointer!==e.pointerId)return;
    if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<6)return;
    const row=document.elementFromPoint(e.clientX,e.clientY)?.closest('.chapterRow');
    if(row&&nav.contains(row)){drag.target=row.dataset.chapterId;nav.querySelectorAll('.dragTarget').forEach(el=>el.classList.remove('dragTarget'));row.classList.add('dragTarget')}
    const box=panel.getBoundingClientRect();if(e.clientY>box.bottom-35)panel.scrollBy(0,18);if(e.clientY<box.top+35)panel.scrollBy(0,-18);
  });
  nav.addEventListener('pointerup',e=>{if(!drag||drag.pointer!==e.pointerId)return;const d=drag;clearDrag();if(d.target&&d.baseline===JSON.stringify(state))reorderChapter(d.id,d.target)});
  nav.addEventListener('pointercancel',clearDrag);nav.addEventListener('lostpointercapture',clearDrag);
  nav.addEventListener('click',e=>{if(e.target.closest('.chapterHandle')){e.preventDefault();e.stopPropagation()}});
  nav.addEventListener('keydown',e=>{
    const handle=e.target.closest('.chapterHandle');if(!handle||composing||e.isComposing)return;
    const id=handle.parentElement.dataset.chapterId;
    if(e.key===' '){e.preventDefault();keyboardId=keyboardId===id?null:id;handle.setAttribute('aria-pressed',String(keyboardId===id))}
    else if(e.key==='Escape'){keyboardId=null;clearDrag()}
    else if(keyboardId===id&&['ArrowUp','ArrowDown'].includes(e.key)){
      e.preventDefault();const i=state.chapters.findIndex(c=>c.id===id),target=state.chapters[i+(e.key==='ArrowUp'?-1:1)];
      if(target&&reorderChapter(id,target.id)){const next=[...nav.querySelectorAll('.chapterRow')].find(r=>r.dataset.chapterId===id)?.querySelector('.chapterHandle');next?.focus();next?.setAttribute('aria-pressed','true')}
    }
  });
  window.LayoutControls={closeChapters,toggleChapters,syncFocusPlacement,syncChapterOrder,reorderChapter};syncChapterOrder();
})();
