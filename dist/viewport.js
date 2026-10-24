// Resize the shell without rebuilding the editor or changing saved preferences.
(()=>{
  const viewport=window.visualViewport;
  function fitViewport(){
    // Let the browser pan/zoom its own visual viewport during ordinary pinch zoom.
    if(viewport&&Math.abs(viewport.scale-1)>.01)return;
    document.documentElement.style.setProperty('--app-height',Math.min(innerHeight,viewport?.height??innerHeight)+'px');
  }
  addEventListener('resize',fitViewport);viewport?.addEventListener('resize',fitViewport);fitViewport();
  for(const el of [document.querySelector('#editor'),document.querySelector('#sidebar'),document.querySelector('#chapterPanel')].filter(Boolean)){
    let timer;
    function reveal(){
      el.classList.add('scroll-active');clearTimeout(timer);
      timer=setTimeout(()=>el.classList.remove('scroll-active'),1200);
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
