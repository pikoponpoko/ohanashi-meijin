/* 脚本の表記ルール: a side panel that never touches the editor, its selection or its scroll position. */
(function(){
  const rows=(head,list)=>`<table><thead><tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${list.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const sections=[
    ['推奨する標準表記',rows(['種類','書き方'],[
      ['柱','<code>○公園（夕）</code>'],['台詞','<code>太郎「行こう」</code>'],['モノローグ','<code>太郎（M）「……」</code>'],
      ['画面外の声','<code>太郎（OFF）「おーい」</code>'],['ト書き','<code>　　　太郎、走り出す。</code>'],['音楽','<code>音楽：テーマ曲</code>'],
      ['SE','<code>SE：ドアが閉まる</code>'],['カット区切り','<code>#C1</code>'],['メモ','<code>メモ：あとで直す</code>']])],
    ['台詞・話者',`<p>話者名のすぐ後に「」を書きます。開いた「」が閉じるまでの行は同じ台詞です。</p><p>話者名のない「」で始まる行も台詞として扱います。</p>`],
    ['モノローグ',`<p><code>（M）</code><code>（OFF）</code><code>（ナレーション）</code>を話者名の直後に付けます。Soku Conteはこれを話し方として読み込みます。</p><p><code>M</code>だけの行や<code>M：</code>は音楽として扱いません。</p>`],
    ['ト書き',`<p>柱・台詞・音楽・SE以外の行はト書きです。行頭の全角3字下げは「字下げ」で揃えられます。</p>`],
    ['柱・場面',rows(['書き方','例'],[['行頭の○','<code>○教室（朝）</code>'],['【】で囲む','<code>【教室】</code>'],['場面「」','<code>場面「教室」</code>'],['場所（時間帯）','<code>教室（朝）</code>']])],
    ['カット区切り',`<p>カット番号は単独の行です。保存時は<code>#C1</code>の形にそろえます。</p><p>TXTを開くときは<code>#1</code>、<code># C1</code>、<code>#C1A</code>、全角の<code>＃Ｃ１</code>も区切りとして読みます。</p>`],
    ['音楽の開始・停止',`<p>行頭に<code>音楽：</code>と曲名を書きます。次の表記も音楽として読みます。</p>${rows(['表記','例'],[['半角コロン','<code>音楽: テーマ曲</code>'],['BGM','<code>BGM：テーマ曲</code>　<code>ＢＧＭ：テーマ曲</code>'],['コロン前の空白','<code>音楽 ：テーマ曲</code>']])}<p>停止の表記はありません。<code>音楽OFF</code>はト書きとして残り、曲名にはなりません。<code>音楽：OFF</code>は曲名「OFF」として読まれるので書かないでください。曲の終わりはSoku Conteの音楽の範囲で設定します。</p>`],
    ['SE・効果音',`<p>行頭に<code>SE：</code>と内容を書きます。<code>効果音：</code>、<code>ＳＥ：</code>、<code>SE:</code>も同じです。英字は大文字で書きます。<code>se：</code>、<code>SFX：</code>はSEとして読みません。</p><p>ファイルを開くとき、<code>SE「ドアの音」</code>、<code>ドアの音「バタン」</code>のような旧表記は<code>SE：</code>の行に直します。</p>`],
    ['改行',`<p>1段落1行です。台詞の途中で改行した行は、「」が閉じるまで同じ台詞として扱います。連続した空行は「空行を整理」で1行にできます。</p>`],
    ['Soku Conteとの脚本データ連携',`<p>保存したJSONをSoku Conteで開くと、章・カット番号・各行の種類（音楽・SEを含む）が引き継がれます。本文の書き方はそのまま保存し、表記を書き換えません。</p><p>M/ME、UND/SRC、歌唱、BPMなどの制作情報はSoku Conteで設定します。脚本に<code>UND:</code>などと書いても音楽の属性にはなりません。</p>`],
    ['誤認例',rows(['書いた行','扱い'],[
      ['<code>太郎「音楽：止めて」</code>','台詞'],['<code>「音楽：テーマ曲」</code>','開くときに音楽の行に直します'],['<code>音楽が流れる。</code>','ト書き'],
      ['<code>音楽OFF</code>','ト書き'],['<code>♪テーマ曲</code>','ト書き（Soku Conteでは音楽）'],['<code>UND: テーマ曲</code>','ト書き'],['<code>メモ：音楽：仮</code>','メモ']])]
  ];
  let box=null;
  function close(){box?.remove();box=null;$('#rules').setAttribute('aria-expanded','false')}
  function open(){
    if(box)return close();
    box=document.createElement('div');box.id='rulesBox';box.setAttribute('role','dialog');box.setAttribute('aria-label','脚本の表記ルール');
    box.innerHTML='<div class="rulesHead"><b>脚本の表記ルール</b><button id="rulesClose" aria-label="閉じる" title="閉じる Esc">×</button></div><div class="rulesBody">'+
      sections.map(([h,b])=>`<section><h3>${h}</h3>${b}</section>`).join('')+'</div>';
    document.body.append(box);$('#rules').setAttribute('aria-expanded','true');
    box.querySelector('#rulesClose').onmousedown=e=>e.preventDefault();box.querySelector('#rulesClose').onclick=close;
  }
  const button=$('#rules');button.onmousedown=e=>e.preventDefault();button.onclick=open;
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&box&&!composing)close()});
  window.ScriptRules={open,close};
})();
