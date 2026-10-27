// In-app print preview: the OS dialog of the desktop build cannot preview, so pages are shown here first.
(()=>{
  const bar=$('#previewBar'),root=$('#printRoot'),count=$('#previewCount'),size=$('#previewSize');
  size.innerHTML=Array.from({length:10},(_,i)=>`<option value="${i+9}">${i+9}pt</option>`).join('');
  let run=0;
  const open=()=>document.body.classList.contains('printpreview');
  function fit(){root.style.setProperty('--previewzoom',Math.min(1,(innerWidth-32)/(297*96/25.4),Math.max(.3,(innerHeight-bar.offsetHeight-48)/(210*96/25.4))))}
  function controls(){
    for(const b of bar.querySelectorAll('[data-columns]'))b.setAttribute('aria-pressed',String(Number(b.dataset.columns)===state.printColumns));
    size.value=String(state.printSize);$('#previewCover').checked=state.cover;
  }
  async function refresh(){
    const token=++run;count.textContent='A4 …';bar.classList.add('busy');
    try{const pages=await layoutPrint();if(token===run)count.textContent=`A4 ${pages}枚`}
    catch(e){console.error(e);if(token===run){count.textContent='';toast(e.message||'印刷用のページを組めませんでした。')}}
    finally{if(token===run)bar.classList.remove('busy')}
  }
  function change(apply){apply();recordHistory();save();controls();refresh()}
  window.openPrintPreview=()=>{document.body.classList.add('printpreview');fit();controls();root.scrollTop=0;refresh()};
  function close(){run++;document.body.classList.remove('printpreview');bar.classList.remove('busy');root.replaceChildren()}
  function print(){if(!bar.classList.contains('busy'))window.print()}
  for(const b of bar.querySelectorAll('[data-columns]'))b.onclick=()=>change(()=>{state.printColumns=Number(b.dataset.columns)});
  size.onchange=()=>change(()=>{state.printSize=Number(size.value)});
  $('#previewCover').onchange=()=>change(()=>{state.cover=$('#previewCover').checked});
  $('#previewPrint').onclick=print;
  $('#previewPdf').onclick=async()=>{if(bar.classList.contains('busy'))return;try{await downloadPdf()}catch(e){console.error(e);toast(e.message?.startsWith('選択したフォント')?e.message:'PDFを生成できませんでした。原稿を保存して再試行してください。')}};
  $('#previewClose').onclick=close;
  addEventListener('resize',()=>{if(open())fit()});
  addEventListener('keydown',e=>{
    if(!open())return;
    if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close()}
    else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='p'){e.preventDefault();e.stopImmediatePropagation();print()}
  },true);
})();
