// Reuse chapter/progress controls in a compact shell; never rebuild the editor on resize.
(()=>{
  const panel=$('#chapterPanel'),picker=$('#menu');let returnFocus=null;
  function closeChapters(restore=false){panel.hidden=true;document.body.classList.remove('mobilemenu');picker.setAttribute('aria-expanded','false');if(restore)returnFocus?.focus()}
  function toggleChapters(){
    if(!panel.hidden)return closeChapters(true);
    returnFocus=document.activeElement;panel.hidden=false;document.body.classList.add('mobilemenu');picker.setAttribute('aria-expanded','true');
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
  function syncChapterOrder(){const i=state.chapters.findIndex(c=>c.id===active);$('#moveChapterEarlier').disabled=i<=0;$('#moveChapterLater').disabled=i>=state.chapters.length-1;$('#chapterNumber').textContent='CHAPTER '+String(i+1).padStart(2,'0')}
  function moveChapter(step){
    if(composing||loadBlocked||$('#dialog').open)return;
    const i=state.chapters.findIndex(c=>c.id===active);if(i+step<0||i+step>=state.chapters.length)return;
    if(dirty){save();if(dirty)return}
    const [c]=state.chapters.splice(i,1);state.chapters.splice(i+step,0,c);ScriptModel.renumber(state);recordHistory();save();renderNav();syncCutLabels();stats();window.FocusNavigation?.sync();
  }
  $('#moveChapterEarlier').onclick=()=>moveChapter(-1);$('#moveChapterLater').onclick=()=>moveChapter(1);
  window.LayoutControls={closeChapters,toggleChapters,syncFocusPlacement,syncChapterOrder};syncChapterOrder();
})();
