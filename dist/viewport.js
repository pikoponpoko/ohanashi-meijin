// Resize the shell without rebuilding the editor or changing saved preferences.
(()=>{
  const viewport=window.visualViewport;
  function fitViewport(){
    // Let the browser pan/zoom its own visual viewport during ordinary pinch zoom.
    if(viewport&&Math.abs(viewport.scale-1)>.01)return;
    document.documentElement.style.setProperty('--app-top',(viewport?.offsetTop??0)+'px');
    document.documentElement.style.setProperty('--app-height',Math.min(innerHeight,viewport?.height??innerHeight)+'px');
  }
  let caretFrame;
  function revealCaret(){
    cancelAnimationFrame(caretFrame);caretFrame=requestAnimationFrame(()=>{
      if(composing||document.activeElement!==$('#editor'))return;
      const range=editorRange();if(!range?.collapsed)return;
      const bounds=range.getBoundingClientRect(),ed=$('#editor'),box=ed.getBoundingClientRect();
      if(!bounds.width&&!bounds.height)return;
      // Scroll only the editor; scrollIntoView can pan the entire mobile page.
      if(bounds.top<box.top+8)ed.scrollTop-=box.top+8-bounds.top;
      if(bounds.bottom>box.bottom-8)ed.scrollTop+=bounds.bottom-(box.bottom-8);
      if(bounds.left<box.left+8)ed.scrollLeft-=box.left+8-bounds.left;
      if(bounds.right>box.right-8)ed.scrollLeft+=bounds.right-(box.right-8);
    });
  }
  addEventListener('resize',()=>{fitViewport();revealCaret()});viewport?.addEventListener('resize',()=>{fitViewport();revealCaret()});viewport?.addEventListener('scroll',fitViewport);fitViewport();
  document.addEventListener('selectionchange',revealCaret);
  document.querySelector('#editor').addEventListener('compositionend',revealCaret);
  document.querySelector('#editor').addEventListener('input',revealCaret);

  for(const el of [document.querySelector('#editor'),document.querySelector('#sidebar'),document.querySelector('#chapterPanel')].filter(Boolean)){
    let timer;
    function reveal(){
      el.classList.add('scroll-active');clearTimeout(timer);
      timer=setTimeout(()=>el.classList.remove('scroll-active'),500);
    }
    el.addEventListener('scroll',reveal,{passive:true});
    el.addEventListener('wheel',reveal,{passive:true});
    el.addEventListener('focusin',reveal);
    el.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','PageUp','PageDown','Home','End','Tab'].includes(e.key))reveal()});
    el.addEventListener('pointermove',e=>{
      const r=el.getBoundingClientRect();
      if(e.clientX-r.left<18||r.right-e.clientX<18||r.bottom-e.clientY<18)reveal();
    },{passive:true});
    el.addEventListener('pointerdown',()=>{el.classList.add('scroll-dragging');reveal()},{passive:true});
    const release=()=>{el.classList.remove('scroll-dragging');};
    addEventListener('pointerup',release,{passive:true});addEventListener('pointercancel',release,{passive:true});addEventListener('blur',release);
  }
})();
