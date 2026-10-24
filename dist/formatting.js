// Paragraph formatting operates on stored kinds, never on template insertion.
function formatPosition(container,offset){
  const ed=$('#editor');
  if(container===ed)return {root:offset};
  const block=topBlock(container);if(!block)return null;
  const range=document.createRange();range.selectNodeContents(block);range.setEnd(container,offset);
  return {block:[...ed.children].indexOf(block),displayOffset:range.toString().length,offset:range.toString().length+(block.dataset.kind==='action'&&block.textContent.trim()?(block.dataset.leading||'').length:0)};
}
function formatRestore(saved){
  if(!saved)return;
  const ed=$('#editor');
  function locate(pos){
    if(pos.root!==undefined)return [ed,Math.min(pos.root,ed.childNodes.length)];
    const block=ed.children[pos.block];if(!block)return [ed,ed.childNodes.length];
    let offset=Math.max(0,pos.offset-(block.dataset.kind==='action'&&block.textContent.trim()?(block.dataset.leading||'').length:0));
    const walker=document.createTreeWalker(block,NodeFilter.SHOW_TEXT);let node;
    while(node=walker.nextNode()){if(offset<=node.length)return [node,offset];offset-=node.length}
    return [block,block.childNodes.length];
  }
  const range=document.createRange();range.setStart(...locate(saved.start));range.setEnd(...locate(saved.end));
  $('#editor').focus({preventScroll:true});const selection=getSelection();selection.removeAllRanges();selection.addRange(range);normalizeEmptyCaret();
}
function formatParagraphs(kind){
  if(!ScriptFormatting.kinds.includes(kind)||composing||loadBlocked||$('#dialog').open)return;
  const ed=$('#editor'),range=editorRange()||(selectedRange?.startContainer.isConnected?selectedRange:null);
  if(!range||!ed.contains(range.commonAncestorContainer))return toast('本文の段落を選択してください。');
  const saved={start:formatPosition(range.startContainer,range.startOffset),end:formatPosition(range.endContainer,range.endOffset)};
  const blocks=[...ed.children];let targets;
  if(range.collapsed)targets=[range.startContainer===ed?blocks[Math.min(range.startOffset,blocks.length-1)]:topBlock(range.startContainer)];
  else{
    targets=blocks.filter(p=>range.intersectsNode(p));
    const end=saved.end,start=saved.start;
    if(end.block!==undefined&&end.displayOffset===0&&start.block!==end.block)targets=targets.filter(p=>p!==blocks[end.block]);
    if(start.block!==undefined&&start.offset>=chapter().text.split('\n')[start.block]?.length&&blocks[start.block]?.textContent.length&&end.block!==start.block)targets=targets.filter(p=>p!==blocks[start.block]);
  }
  targets=targets.filter(p=>p&&!p.dataset.cutId);
  if(!targets.length)return;
  const c=chapter(),lines=c.text.split('\n');
  const origins=lines.map((s,i)=>c.cuts.some(cut=>cut.line===i)?null:c.formatOrigins?.[i]||(c.formats?.[i]?'legacy':'auto'));
  const formats=lines.map((s,i)=>c.cuts.some(cut=>cut.line===i)?null:c.formats?.[i]||ScriptFormatting.inferred(s));
  for(const p of targets){const i=blocks.indexOf(p);if(p.dataset.placeholder){c.placeholderFormat=kind;if(kind==='dialogue'){lines.push('「」');formats.push('dialogue');origins.push('manual');delete c.placeholderFormat}}else if(i<formats.length){
    const raw=lines[i],trimmed=raw.trimStart();
    if(kind==='scene'&&!/^[○◯〇]/.test(trimmed)){lines[i]='◯'+trimmed;for(const pos of [saved.start,saved.end])if(pos.block===i)pos.offset=Math.max(1,pos.offset-(raw.length-trimmed.length)+1)}
    if(kind==='dialogue'&&!/「/.test(trimmed)){lines[i]='「'+raw+'」';for(const pos of [saved.start,saved.end])if(pos.block===i)pos.offset++}
    formats[i]=kind;origins[i]='manual';
  }}
  c.text=lines.join('\n');c.formatOrigins=origins;
  c.formats=formats;ScriptModel.renumber(state);recordHistory();save();renderText();stats();formatRestore(saved);if(kind==='dialogue'&&targets.length===1&&(!targets[0].textContent.trim()||targets[0].dataset.placeholder)){const block=[...ed.children].find((p,i)=>i===(saved.start.block??ed.children.length-1));if(block?.firstChild){const r=document.createRange();r.setStart(block.firstChild,1);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r);ed.focus()}}
}
$('#autoFormat').onclick=()=>{
  if(composing||loadBlocked)return;
  const source=chapter(),baseline=JSON.stringify(source),plan=ScriptFormatting.analyze(source),choices={};
  modal('自動整形の確認','<p>本文・改行・カットは変えず、段落の書式だけを提案します。柱は場面情報、ト書きの各行は動作単位です。セリフの折り返しからカットや絵を作りません。</p>');
  const table=document.createElement('table');table.className='formatPreview';
  const head=table.createTHead().insertRow();for(const title of ['原文','現在 → 提案','確認']){const th=document.createElement('th');th.textContent=title;head.append(th)}
  const labels={scene:'柱',action:'ト書き',dialogue:'セリフ'};
  for(const row of plan){
    const tr=table.insertRow(),text=tr.insertCell(),after=tr.insertCell(),review=tr.insertCell();
    text.textContent=row.raw||'（空行）';
    if(row.cut){after.textContent='カット境界を保持';continue}
    after.textContent=labels[row.current]+' → '+labels[row.kind];
    if(row.certainty==='uncertain'){
      const select=document.createElement('select');select.setAttribute('aria-label',(row.line+1)+'行目の書式');
      for(const [value,label] of [['','未確定：現在の書式を維持'],...Object.entries(labels)]){const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option)}
      select.onchange=()=>{if(select.value)choices[row.line]=select.value;else delete choices[row.line];after.textContent=labels[row.current]+' → '+labels[select.value||row.current]};review.append(select);
    }else review.textContent=row.reason;
  }
  const wrap=document.createElement('div');wrap.className='formatPreviewWrap';wrap.append(table);$('#dialogBody').append(wrap);
  const apply=document.createElement('button');apply.className='primary';apply.id='applyAutoFormat';apply.textContent='確認した書式を適用';
  const cancel=document.createElement('button');cancel.id='cancelAutoFormat';cancel.textContent='キャンセル';cancel.onclick=()=>$('#dialog').close();
  apply.onclick=()=>{
    if(composing||loadBlocked)return;
    if(chapter()!==source||JSON.stringify(source)!==baseline)return toast('原稿が変わったため、整形結果を確認し直してください。');
    const candidate=ScriptFormatting.apply(source,plan,choices);Object.assign(source,candidate);recordHistory();save();renderText();stats();$('#dialog').close();
  };
  $('#dialogBody').append(apply,cancel);
};
