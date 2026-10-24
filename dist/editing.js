// A single history covers text, cuts, and chapter operations. IME commits once.
let history=[], historyIndex=0;
function historySelection(){
  const r=editorRange(),ed=$('#editor');if(!r)return null;
  function position(node,offset){if(node===ed)return {root:offset};const block=topBlock(node);if(!block)return null;const range=document.createRange();range.selectNodeContents(block);range.setEnd(node,offset);return {block:[...ed.children].indexOf(block),offset:range.toString().length}}
  return {start:position(r.startContainer,r.startOffset),end:position(r.endContainer,r.endOffset)};
}
function restoreHistorySelection(saved){
  const ed=$('#editor');
  function locate(pos){if(!pos)return [ed,ed.childNodes.length];if(pos.root!==undefined)return [ed,Math.min(pos.root,ed.childNodes.length)];const block=ed.children[pos.block]||ed.lastElementChild;let remaining=pos.offset;const walker=document.createTreeWalker(block,NodeFilter.SHOW_TEXT);let node;while(node=walker.nextNode()){if(remaining<=node.length)return [node,remaining];remaining-=node.length}return [block,block.childNodes.length]}
  if(!saved)return caretEnd(ed.lastElementChild);
  const r=document.createRange();r.setStart(...locate(saved.start));r.setEnd(...locate(saved.end));getSelection().removeAllRanges();getSelection().addRange(r);ed.focus();
}
function snapshot(){return {state:JSON.stringify(state),active,selection:historySelection()}}
function resetHistory(){history=[snapshot()];historyIndex=0;syncHistory()}
function recordHistory(){if(!history.length)return;if(history[historyIndex].state===JSON.stringify(state))return;history.splice(historyIndex+1);history.push(snapshot());if(history.length>150)history.shift();historyIndex=history.length-1;syncHistory()}
function syncHistory(){const undo=$('#undo'),redo=$('#redo');if(undo)undo.disabled=historyIndex<=0;if(redo)redo.disabled=historyIndex>=history.length-1}
function travelHistory(step){if(composing||loadBlocked)return;const next=historyIndex+step;if(next<0||next>=history.length)return;historyIndex=next;const entry=history[next];state=JSON.parse(entry.state);active=state.chapters.some(c=>c.id===entry.active)?entry.active:state.chapters[0].id;save();render();restoreHistorySelection(entry.selection);syncHistory()}
document.addEventListener('selectionchange',()=>{if(history.length&&history[historyIndex].state===JSON.stringify(state)&&document.activeElement===$('#editor'))history[historyIndex].selection=historySelection()});
// History remains available through keyboard and touch; screen buttons are optional.
for(const [id,step] of [['undo',-1],['redo',1]]){const button=$('#'+id);if(button){button.onmousedown=e=>e.preventDefault();button.onclick=()=>travelHistory(step)}}
document.addEventListener('keydown',e=>{if(composing||e.isComposing||$('#dialog').open)return;const target=e.target;if(target!==$('#editor')&&target!==document.body&&!target.closest?.('#editor'))return;if((e.ctrlKey||e.metaKey)&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();travelHistory(e.key.toLowerCase()==='y'||e.shiftKey?1:-1)}});
$('#editor').addEventListener('beforeinput',e=>{if(composing||e.isComposing)return;if(e.inputType==='historyUndo'||e.inputType==='historyRedo'){e.preventDefault();travelHistory(e.inputType==='historyUndo'?-1:1)}else if(['insertParagraph','insertLineBreak'].includes(e.inputType)){e.preventDefault();enterParagraph(e.inputType==='insertParagraph')}});
function editorRange(){const sel=getSelection();if(!sel.rangeCount)return null;const r=sel.getRangeAt(0);return $('#editor').contains(r.commonAncestorContainer)?r:null}
function caretEnd(p){const r=document.createRange();r.selectNodeContents(p);r.collapse(false);const sel=getSelection();sel.removeAllRanges();sel.addRange(r);$('#editor').focus()}
function topBlock(node){while(node&&node.parentNode!==$('#editor'))node=node.parentNode;return node?.nodeType===1?node:null}
// Keep the insertion point inside the surviving start paragraph. Range.deleteContents
// otherwise collapses between blocks and creates extra paragraphs on paste.
function deleteRange(r){
  const start=topBlock(r.startContainer),end=topBlock(r.endContainer),caret=r.cloneRange();caret.collapse(true);
  r.deleteContents();
  if(start?.isConnected&&!start.dataset.cutId){
    if(end&&end!==start&&end.isConnected&&!end.dataset.cutId){start.append(...end.childNodes);end.remove()}
    return caret;
  }
  return r;
}
function replaceSelection(records,externalCuts=false){
  const selection=editorRange();
  if(externalCuts&&records[0]?.id&&selection){
    const whole=document.createRange();whole.selectNodeContents($('#editor'));
    const coversAll=selection.compareBoundaryPoints(Range.START_TO_START,whole)<=0&&selection.compareBoundaryPoints(Range.END_TO_END,whole)>=0;
    const emptyChapter=chapter().cuts.length===1&&!chapter().text.split('\n').filter((_,i)=>i!==chapter().cuts[0].line).join('').trim();
    if(coversAll||emptyChapter){
      // Reuse a truly empty editing slot; do not leave its synthetic first cut behind.
      if(emptyChapter)records[0].id=chapter().cuts[0].id;
      assignLines(chapter(),records);ScriptModel.renumber(state);recordHistory();changed();renderText();stats();caretEnd($('#editor').lastElementChild);return;
    }
  }
  let r=editorRange();if(!r)return;r=deleteRange(r);let top=topBlock(r.startContainer);
  if(!top||top.dataset.cutId){top=paragraph('');r.insertNode(top);r.selectNodeContents(top);r.collapse(false)}
  const tail=document.createRange();tail.selectNodeContents(top);tail.setStart(r.startContainer,r.startOffset);const fragment=tail.extractContents();
  // Remove placeholder BR before appending actual text.
  if(top.textContent===''){top.replaceChildren();top.dataset.leading=(records[0]?.text.match(/^[ \u3000]*/)||[''])[0];if(records[0]?.kind){top.dataset.kind=records[0].kind;top.dataset.formatOrigin=records[0].origin||'legacy';delete top.dataset.auto;top.className=records[0].kind}}let current=top;
  records.forEach((record,i)=>{if(i||record.id){const p=paragraph(record.text,record.kind,record.origin);if(record.id){p.className='cut';p.dataset.cutId=record.id;p.contentEditable='false'}current.after(p);current=p}else current.append(document.createTextNode(record.text))});
  if(current.dataset.cutId){const p=paragraph('');current.after(p);current=p}
  const caret=document.createRange();caret.selectNodeContents(current);caret.collapse(false);
  current.append(fragment);if(!current.childNodes.length)current.append(document.createElement('br'));
  // Canonicalize indentation using the original paragraph type, preserving words.
  const sel=getSelection();sel.removeAllRanges();sel.addRange(caret);$('#editor').focus();capture();
}
function enterParagraph(allowCut){const r=editorRange();if(!r)return;const p=topBlock(r.startContainer);if(r.collapsed&&p&&!p.textContent.trim()){const before=[...$('#editor').children].slice(0,[...$('#editor').children].indexOf(p));let hasBody=false;for(const b of before.reverse()){if(b.dataset.cutId)break;if(b.textContent.trim())hasBody=true}if(!hasBody)return;}if(allowCut&&r.collapsed&&p&&!p.dataset.cutId&&!p.textContent.trim()&&p.previousElementSibling&&!p.previousElementSibling.dataset.cutId){p.replaceChildren(document.createTextNode('#C1'));p.className='cut';p.dataset.cutId=uid();p.contentEditable='false';const next=paragraph('');p.after(next);caretEnd(next);capture()}else replaceSelection([{text:''},{text:''}])}
let cutClipboard=null;
function rangeRecords(r,remove=false){
  const start=topBlock(r.startContainer),end=topBlock(r.endContainer);
  if(start&&start===end&&start.dataset.cutId)r.selectNode(start);
  const fragment=r.cloneContents();if(remove)deleteRange(r);
  if(start&&start===end&&!start.dataset.cutId){const wrapper=start.cloneNode(false);wrapper.append(fragment);const root=document.createDocumentFragment();root.append(wrapper);return domLines(root)}
  return domLines(fragment);
}
function clipboardRecords(r){return rangeRecords(r)}
for(const action of ['copy','cut'])$('#editor').addEventListener(action,e=>{const r=editorRange();if(!r||r.collapsed||composing)return;const records=clipboardRecords(r);e.preventDefault();e.clipboardData.setData('text/plain',records.map(x=>x.text).join('\n'));const token=uid();e.clipboardData.setData('application/x-ohanashi',JSON.stringify({token,records}));if(action==='cut'){cutClipboard={token,ids:records.filter(x=>x.id).map(x=>x.id)};const caret=deleteRange(r),sel=getSelection();sel.removeAllRanges();sel.addRange(caret);capture()}});
function pasteText(e){if(composing)return;e.preventDefault();let records;try{const data=JSON.parse(e.clipboardData.getData('application/x-ohanashi'));const used=new Set(state.chapters.flatMap(c=>c.cuts.map(x=>x.id)));if(Array.isArray(data.records)&&data.records.every(x=>x&&typeof x.text==='string'&&!/[\r\n]/.test(x.text)&&[undefined,null,'scene','action','dialogue'].includes(x.kind)&&[undefined,null,'manual','auto','legacy'].includes(x.origin)&&(x.id===undefined||(typeof x.id==='string'&&x.id&&ScriptModel.marker.test(x.text)))))records=data.records.map(x=>({...x,id:x.id?(data.token===cutClipboard?.token&&!used.has(x.id)?x.id:uid()):undefined}))}catch(_){}
  const external=!records;
  if(external){const raw=ScriptModel.importText(e.clipboardData.getData('text/plain')),parsed=ScriptModel.importChapter({id:uid(),title:'',text:raw}),cuts=new Map(parsed.cuts.map(c=>[c.line,c]));records=parsed.text.split('\n').map((text,i)=>({text,...(cuts.has(i)?{id:cuts.get(i).id}:{})}));if(!ScriptModel.marker.test(raw.split('\n')[0]))records.shift();if(!records.length)records=[{text:''}]}replaceSelection(records,external);cutClipboard=null;
}
// Repair only redundant empty lines; cut boundaries remain explicit and retain IDs.
const originalCheck=showCheck;
showCheck=function(){
  originalCheck();const c=chapter();
  for(const [label,fix] of [['増殖した空行を整理',ScriptModel.repair],['空行を削除',ScriptModel.removeBlankLines]]){
    const fixed=fix(c);if(fixed.text===c.text)continue;
    const b=document.createElement('button');b.className='primary';b.textContent=label;
    b.onclick=()=>{if(composing||loadBlocked)return;Object.assign(c,fixed);ScriptModel.renumber(state);recordHistory();save();renderText();stats();$('#dialog').close()};
    $('#dialogBody').prepend(b);
  }
};$('#check').onclick=()=>showCheck();
// Text in non-editor controls also participates in the same project history.
$('#chapterTitle').addEventListener('input',recordHistory);$('#status').addEventListener('change',recordHistory);
// First outside tap closes the drawer without changing the selection/caret.
$('#sidebarBackdrop').addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation()});
let gesture=null;
const editor=$('#editor');
editor.addEventListener('touchstart',e=>{if(composing||$('#dialog').open||document.body.classList.contains('mobilemenu'))return;const now=performance.now();if(!gesture){gesture={time:now,points:new Map(),max:0,bad:false}}if(now-gesture.time>120&&e.touches.length>gesture.max)gesture.bad=true;for(const t of e.changedTouches)gesture.points.set(t.identifier,{x:t.clientX,y:t.clientY});gesture.max=Math.max(gesture.max,e.touches.length);if(gesture.max>3)gesture.bad=true},{passive:true});
editor.addEventListener('touchmove',e=>{if(!gesture)return;for(const t of e.changedTouches){const p=gesture.points.get(t.identifier);if(!p||Math.hypot(t.clientX-p.x,t.clientY-p.y)>10)gesture.bad=true}},{passive:true});
editor.addEventListener('touchcancel',()=>gesture=null,{passive:true});
editor.addEventListener('touchend',e=>{if(!gesture)return;for(const t of e.changedTouches){const p=gesture.points.get(t.identifier);if(!p||Math.hypot(t.clientX-p.x,t.clientY-p.y)>10)gesture.bad=true}if(e.touches.length)return;const g=gesture;gesture=null;if(!g.bad&&performance.now()-g.time<300&&[2,3].includes(g.max)&&!composing&&!$('#dialog').open){if(e.cancelable)e.preventDefault();travelHistory(g.max===2?-1:1)}},{passive:false});
resetHistory();render();
