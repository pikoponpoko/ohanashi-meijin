/* Find and replace across every chapter. Cut boundary lines are never searched or changed. */
(function(){
  let box=null;
  // Matches start after the paragraph indentation, which belongs to the paragraph format.
  const lead=line=>(line.match(/^[ 　]*/)||[''])[0].length;
  function open(){
    if(box){const q=box.querySelector('#findQuery');q.focus();q.select();return}
    box=document.createElement('div');box.id='findBox';box.setAttribute('role','dialog');box.setAttribute('aria-label','検索と置換');
    box.innerHTML='<div class="findHead"><b>検索と置換</b><span id="findCount" role="status"></span><button id="findClose" title="閉じる Esc" aria-label="閉じる">×</button></div>'+
      '<div class="findRow"><input id="findQuery" aria-label="検索する文字" placeholder="検索"><button id="findPrev" title="前を検索 Shift+Enter" aria-label="前を検索">↑</button><button id="findNext" title="次を検索 Enter" aria-label="次を検索">↓</button></div>'+
      '<div class="findRow"><input id="findReplace" aria-label="置き換える文字" placeholder="置換"><button id="findReplaceOne" title="選んでいる1件を置換 Enter">置換</button><button id="findReplaceAll">すべて置換</button></div>'+
      '<label class="findOption"><input id="findCase" type="checkbox"> 英字の大文字・小文字を区別</label><div id="findList"></div>';
    document.body.append(box);
    const q=box.querySelector('#findQuery'),rep=box.querySelector('#findReplace'),cased=box.querySelector('#findCase'),list=box.querySelector('#findList'),count=box.querySelector('#findCount');
    let hits=[],cur=-1,signature='',shown=null;
    const norm=s=>cased.checked?s:s.toLowerCase();
    function positions(line,key){const out=[],from=lead(line),t=norm(line),k=norm(key);for(let i=t.indexOf(k,from);i>=0&&k;i=t.indexOf(k,i+k.length))out.push(i);return out}
    function search(){
      const key=q.value;hits=[];
      if(key)state.chapters.forEach(c=>{
        const lines=c.text.split('\n'),cutLines=new Set(c.cuts.map(x=>x.line));let cut='';
        lines.forEach((line,i)=>{if(cutLines.has(i)){cut=line.replace(/^#/,'');return}for(const at of positions(line,key))hits.push({chapter:c.id,line:i,at,cut,text:line})});
      });
      cur=hits.length?Math.min(cur,hits.length-1):-1;signature=JSON.stringify(state.chapters);draw();
    }
    function refresh(){if(signature!==JSON.stringify(state.chapters))search()}
    function draw(){
      list.replaceChildren();const key=q.value;
      hits.forEach((h,i)=>{
        const row=document.createElement('button');row.className='findHit'+(i===cur?' on':'');
        const c=state.chapters.find(x=>x.id===h.chapter),place=document.createElement('b');place.textContent=(state.chapters.length>1?(state.chapters.indexOf(c)+1)+'章 ':'')+h.cut;
        const text=document.createElement('span'),start=Math.max(lead(h.text),h.at-12),mark=document.createElement('mark');
        mark.textContent=h.text.slice(h.at,h.at+key.length);text.append((start>lead(h.text)?'…':'')+h.text.slice(start,h.at),mark,h.text.slice(h.at+key.length));
        row.append(place,text);row.onmousedown=e=>e.preventDefault();row.onclick=()=>{cur=i;go();draw()};list.append(row);
      });
      count.textContent=key?(hits.length?(cur>=0?(cur+1)+' / ':'')+hits.length+'件':'見つかりません'):'';
      list.querySelector('.on')?.scrollIntoView({block:'nearest'});
    }
    // Shows the hit by selecting it in the editor, switching chapters when needed.
    function go(){
      const h=hits[cur];if(!h||composing||loadBlocked)return;
      if(h.chapter!==active){if(dirty){save();if(dirty)return toast('保存できないため章の移動を中止しました。')}active=h.chapter;render()}
      const p=$('#editor').children[h.line];if(!p)return;
      // Action paragraphs display their text without the stored indentation.
      const offset=h.at-(h.text.length-p.textContent.length),r=document.createRange();
      const point=n=>{const walker=document.createTreeWalker(p,NodeFilter.SHOW_TEXT);let node;while(node=walker.nextNode()){if(n<=node.length)return [node,n];n-=node.length}return null};
      const a=point(offset),b=point(offset+q.value.length);if(!a||!b)return;r.setStart(...a);r.setEnd(...b);
      shown=r;if(window.Highlight&&CSS.highlights)CSS.highlights.set('findHit',new Highlight(r));else{getSelection().removeAllRanges();getSelection().addRange(r)}
      (r.startContainer.parentElement||p).scrollIntoView({block:'center',inline:'center'});
    }
    function step(dir){refresh();if(!hits.length)return;cur=(cur+dir+hits.length)%hits.length;go();draw()}
    function replaceLine(line,at,key){return line.slice(0,at)+rep.value+line.slice(at+key.length)}
    // Every replacement is one history step; an invalid manuscript is never kept.
    function apply(targets){
      if(composing||loadBlocked||!targets.length)return 0;
      const key=q.value,before=JSON.stringify(state.chapters);let skipped=0;
      const grouped=new Map();for(const h of targets){const k=h.chapter+':'+h.line;if(!grouped.has(k))grouped.set(k,[]);grouped.get(k).push(h)}
      for(const group of grouped.values()){
        const c=state.chapters.find(x=>x.id===group[0].chapter),lines=c.text.split('\n');let line=lines[group[0].line];
        for(const h of group.sort((a,b)=>b.at-a.at))line=replaceLine(line,h.at,key);
        if(ScriptModel.externalMarker.test(line)){skipped+=group.length;continue}
        lines[group[0].line]=line;c.text=lines.join('\n');
      }
      try{ScriptModel.renumber(state);validate(JSON.parse(JSON.stringify(state)))}catch(_){state.chapters=JSON.parse(before);toast('カット情報が崩れるため置換を中止しました。');return 0}
      if(skipped)toast(skipped+'件はカット番号になるため置換しませんでした。');
      recordHistory();save();renderText();stats();return targets.length-skipped;
    }
    function replaceOne(){
      refresh();if(cur<0&&hits.length)cur=0;const h=hits[cur];if(!h)return;
      const done=apply([h]);search();if(hits.length){cur=Math.min(cur,hits.length-1);go();draw()}
      if(done)toast('1件置換しました（元に戻す: Ctrl+Z）');
    }
    function replaceAll(){
      search();if(!hits.length)return toast('見つかりません');
      const done=apply(hits);search();if(done)toast(done+'件置換しました（元に戻す: Ctrl+Z）');
    }
    function close(){box.remove();box=null;document.removeEventListener('focusin',onFocus);CSS.highlights?.delete('findHit');if(shown&&$('#editor').contains(shown.startContainer)){$('#editor').focus({preventScroll:true});getSelection().removeAllRanges();getSelection().addRange(shown)}}
    function onFocus(e){if(box?.contains(e.target))refresh()}
    q.addEventListener('input',()=>{cur=-1;search()});cased.addEventListener('change',()=>{cur=-1;search()});
    q.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing&&e.keyCode!==229){e.preventDefault();step(e.shiftKey?-1:1)}});
    rep.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing&&e.keyCode!==229){e.preventDefault();replaceOne()}});
    box.querySelector('#findPrev').onclick=()=>step(-1);box.querySelector('#findNext').onclick=()=>step(1);
    box.querySelector('#findReplaceOne').onclick=replaceOne;box.querySelector('#findReplaceAll').onclick=replaceAll;box.querySelector('#findClose').onclick=close;
    for(const b of box.querySelectorAll('.findRow button'))b.onmousedown=e=>e.preventDefault();
    // Keys typed here stay here; Esc closes.
    box.addEventListener('keydown',e=>{if(e.key==='Escape'&&!e.isComposing){e.preventDefault();close()}e.stopPropagation()});
    document.addEventListener('focusin',onFocus);
    const selected=String(getSelection()||'').trim();if(selected&&selected.length<60&&!selected.includes('\n'))q.value=selected;
    q.focus();q.select();search();
  }
  $('#find').onmousedown=e=>e.preventDefault();$('#find').onclick=open;
  document.addEventListener('keydown',e=>{if(composing||e.isComposing||e.keyCode===229||$('#dialog').open)return;if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&!e.altKey&&['f','h'].includes(e.key.toLowerCase())){e.preventDefault();open();if(e.key.toLowerCase()==='h')box.querySelector('#findReplace').focus()}});
  window.FindReplace={open};
})();
