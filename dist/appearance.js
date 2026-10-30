// Appearance kept in this browser, never in the manuscript: colour theme, background image, web fonts.
// Themes are プリプロ名人's theme files (PreproMeijin_theme_*.json, format "vconte-theme").
(()=>{
  const SETTINGS='ohanashi.appearance',THEMES='ohanashi.themes',DB='ohanashi-appearance-v1',STORE='files',BG_KEY='background';
  const desktop=!!window.ohanashiDesktop,bundled=['Noto Serif JP','Noto Sans JP','Zen Old Mincho'];
  const hex=v=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v.trim());
  const read=(key,fallback)=>{try{const v=JSON.parse(localStorage.getItem(key)||'null');return v??fallback}catch(_){return fallback}};
  const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true}catch(_){return false}};
  const num=(v,min,max,d)=>typeof v==='number'&&v>=min&&v<=max?v:d;
  function loadSettings(){const s=read(SETTINGS,{});return {theme:typeof s.theme==='string'?s.theme:'default',bgA:num(s.bgA,0,1,.35),bgX:num(s.bgX,0,100,50),bgY:num(s.bgY,0,100,50),bgZ:num(s.bgZ,100,300,100)}}
  let settings=loadSettings();
  const saveSettings=()=>write(SETTINGS,settings);

  // ---- colour themes: プリプロ名人's themes (themes.js), a custom theme, theme files ----
  const KEYS=['bg','paper','ink','muted','line'],CUSTOM='ohanashi.customTheme';
  const DEFAULT={light:{bg:'#eeece6',paper:'#f5f3ed',ink:'#30302f',muted:'#898987',line:'#e2e2df'},dark:{bg:'#262626',paper:'#2c2c2c',ink:'#dededb',muted:'#999995',line:'#404040'}};
  // themes.js order: bg, panel, line, text, muted
  const fromPrepro=c=>({bg:c[0],paper:c[1],line:c[2],ink:c[3],muted:c[4]});
  const builtins=(window.PREPRO_THEMES||[]).map(([id,name,swatch,light,dark,darkFirst])=>({id,name,swatch,light:fromPrepro(light),dark:fromPrepro(dark),darkFirst:!!darkFirst}));
  const TONE_VARS=['--bg','--panel','--line','--text','--muted'];
  function validPack(p){
    return !!p&&typeof p==='object'&&p.format==='vconte-theme'&&typeof p.id==='string'&&p.id&&p.id!=='default'&&
      ['light','dark'].every(t=>p[t]&&p[t].app&&TONE_VARS.every(k=>hex(p[t].app[k])));
  }
  const fromPack=a=>fromPrepro(TONE_VARS.map(k=>a[k].trim().toUpperCase()));
  function packFrom(p){
    return {format:'vconte-theme',id:p.id,name:typeof p.name==='string'&&p.name.trim()?p.name.trim().slice(0,60):p.id,
      palette:Array.isArray(p.palette)?p.palette.filter(hex).slice(0,12):[],light:{app:p.light.app},dark:{app:p.dark.app}};
  }
  let files=read(THEMES,[]);if(!Array.isArray(files))files=[];files=files.filter(validPack);
  if(files.some(t=>t.id===settings.theme))settings.theme='file:'+settings.theme;
  const fileThemes=()=>files.map(p=>({id:'file:'+p.id,name:p.name,swatch:p.palette.length?p.palette.slice(0,6):[p.light.app['--panel'],p.light.app['--bg'],p.light.app['--line'],p.light.app['--muted'],p.light.app['--text']],light:fromPack(p.light.app),dark:fromPack(p.dark.app),file:p.id}));
  function validTone(t){return !!t&&KEYS.every(k=>hex(t[k]))}
  let custom=read(CUSTOM,null);if(!custom||!validTone(custom.light)||!validTone(custom.dark))custom=null;
  const customTheme=()=>({id:'custom',name:'カスタム',swatch:[...new Set(KEYS.map(k=>(custom||DEFAULT).light[k]))],...(custom||DEFAULT)});
  const all=()=>[...builtins,...fileThemes()];
  const current=()=>settings.theme==='custom'?customTheme():all().find(t=>t.id===settings.theme)||null;
  const tone=()=>document.body.classList.contains('dark')?'dark':'light';
  // WCAG contrast of two colours
  const lum=h=>{const v=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(c=>c<=.03928?c/12.92:((c+.055)/1.055)**2.4);return .2126*v[0]+.7152*v[1]+.0722*v[2]};
  const contrast=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
  function applyTheme(){
    const body=document.body,theme=current(),names=['--bg','--paper','--ink','--muted','--line','--side','--done','--review','--todo'];
    names.forEach(n=>body.style.removeProperty(n));
    const meta=document.querySelector('meta[name=theme-color]');
    if(!theme){meta?.setAttribute('content',tone()==='dark'?'#232323':'#eeefec');return}
    const c=theme[tone()];
    const vars={'--bg':c.bg,'--paper':c.paper,'--ink':c.ink,'--muted':c.muted,'--line':c.line,'--side':c.bg,'--done':c.ink,'--review':c.muted,'--todo':c.line};
    for(const [k,v] of Object.entries(vars))body.style.setProperty(k,v);
    meta?.setAttribute('content',c.bg);
  }
  async function importTheme(file){
    let pack;try{pack=JSON.parse(await file.text())}catch(_){throw Error('テーマファイルを読み込めません。')}
    if(!validPack(pack))throw Error('プリプロ名人のテーマファイル（.json）を選んでください。');
    pack=packFrom(pack);
    const next=[...files.filter(t=>t.id!==pack.id),pack];
    if(!write(THEMES,next))throw Error('テーマを保存できません。');
    files=next;selectTheme('file:'+pack.id);
  }
  function removeTheme(id){files=files.filter(t=>'file:'+t.id!==id);write(THEMES,files);if(settings.theme===id){settings.theme='default';saveSettings()}applyTheme()}
  function selectTheme(id){
    if(id==='custom'&&!custom){const from=current()||{...DEFAULT};custom={light:{...from.light},dark:{...from.dark}};write(CUSTOM,custom)}
    settings.theme=id==='custom'||all().some(t=>t.id===id)?id:'default';saveSettings();
    if(current()?.darkFirst&&!state.dark)$('#theme').click();else applyTheme();
  }
  function setCustom(key,value){
    if(!hex(value))return false;
    if(!custom){const from=current()||DEFAULT;custom={light:{...from.light},dark:{...from.dark}}}
    custom[tone()][key]=value.toUpperCase();write(CUSTOM,custom);settings.theme='custom';saveSettings();applyTheme();return true;
  }
  function resetCustom(){custom={light:{...DEFAULT.light},dark:{...DEFAULT.dark}};write(CUSTOM,custom);applyTheme()}

  // ---- background image (as in 尺取名人: up to 1280px JPEG, strength, position, zoom) ----
  const layer=document.createElement('div');layer.id='backgroundImage';layer.setAttribute('aria-hidden','true');
  const writing=document.querySelector('#writing');writing.prepend(layer);
  let image=null,imageURL=null;
  function db(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
  async function idb(mode,fn){const d=await db();try{return await new Promise((resolve,reject)=>{const t=d.transaction(STORE,mode),q=fn(t.objectStore(STORE));t.oncomplete=()=>resolve(q?.result);t.onerror=t.onabort=()=>reject(t.error)})}finally{d.close()}}
  function layout(){
    if(!image||settings.bgA<=0){layer.hidden=true;return}
    const w=writing.clientWidth,h=writing.clientHeight;if(!w||!h)return;
    const sc=Math.max(w/image.naturalWidth,h/image.naturalHeight)*settings.bgZ/100;
    layer.hidden=false;layer.style.backgroundImage=`url("${imageURL}")`;layer.style.opacity=settings.bgA;
    layer.style.backgroundSize=`${image.naturalWidth*sc}px ${image.naturalHeight*sc}px`;layer.style.backgroundPosition=`${settings.bgX}% ${settings.bgY}%`;
  }
  function show(blob){
    if(imageURL)URL.revokeObjectURL(imageURL);image=null;imageURL=null;
    if(!blob){layout();return Promise.resolve()}
    const url=URL.createObjectURL(blob),im=new Image();
    return new Promise(resolve=>{im.onload=()=>{image=im;imageURL=url;layout();resolve()};im.onerror=()=>{URL.revokeObjectURL(url);layout();resolve()};im.src=url});
  }
  const ready=('indexedDB' in window?idb('readonly',s=>s.get(BG_KEY)).then(show):Promise.resolve()).catch(()=>{});
  function shrink(file){
    const url=URL.createObjectURL(file),im=new Image();
    return new Promise((resolve,reject)=>{
      im.onload=()=>{URL.revokeObjectURL(url);const m=1280,sc=Math.min(1,m/Math.max(im.naturalWidth,im.naturalHeight)),c=document.createElement('canvas');
        c.width=Math.max(1,Math.round(im.naturalWidth*sc));c.height=Math.max(1,Math.round(im.naturalHeight*sc));c.getContext('2d').drawImage(im,0,0,c.width,c.height);
        c.toBlob(b=>b?resolve(b):reject(Error()),'image/jpeg',.72)};
      im.onerror=()=>{URL.revokeObjectURL(url);reject(Error())};im.src=url;
    });
  }
  async function setBackground(file){
    let blob;try{blob=await shrink(file);await idb('readwrite',s=>s.put(blob,BG_KEY))}catch(_){throw Error('画像を読み込めませんでした。')}
    settings.bgX=50;settings.bgY=50;settings.bgZ=100;saveSettings();await show(blob);
  }
  async function clearBackground(){try{await idb('readwrite',s=>s.delete(BG_KEY))}catch(_){}await show(null)}
  new ResizeObserver(layout).observe(writing);

  // ---- web fonts ----
  const fonts=()=>desktop?bundled:ScriptModel.fonts;
  function loadFont(family){
    if(desktop||bundled.includes(family))return;
    const id='font-'+family.replace(/\W+/g,'-');if(document.getElementById(id))return;
    const link=document.createElement('link');link.id=id;link.rel='stylesheet';link.crossOrigin='anonymous';
    link.href='https://fonts.googleapis.com/css2?family='+encodeURIComponent(family).replace(/%20/g,'+')+'&display=swap';
    document.head.append(link);
  }

  // ---- settings dialog section ----
  const swatches=c=>(c||[]).slice(0,6).map(x=>`<i style="background:${x}"></i>`).join('');
  const LABELS={bg:'背景',paper:'本文欄',ink:'文字',muted:'補助の文字',line:'線'};
  function html(){
    const id=current()?.id||'default',item=t=>`<div class="themeItem"><button type="button" class="themeChoice${t.id===id?' on':''}" data-theme="${esc(t.id)}" aria-pressed="${t.id===id}"><span class="themeSwatch">${swatches(t.swatch)}</span><span>${esc(t.name)}</span></button>${t.file?`<button type="button" class="themeRemove" data-remove="${esc(t.id)}" aria-label="${esc(t.name)}を削除" title="削除">×</button>`:''}</div>`;
    const c=current()?.id==='custom'?customTheme()[tone()]:null,low=c&&contrast(c.ink,c.paper)<4.5;
    return `<label>テーマ</label><div class="toneSwitch" role="group" aria-label="ライト・ダーク">${[['light','ライト'],['dark','ダーク']].map(([t,l])=>`<button type="button" data-tone="${t}" aria-pressed="${tone()===t}"${tone()===t?' class="on"':''}>${l}</button>`).join('')}</div><div class="themeList">${[{id:'default',name:'デフォルト',swatch:[DEFAULT.light.paper,DEFAULT.light.bg,DEFAULT.light.line,DEFAULT.light.muted,DEFAULT.light.ink]},...all(),customTheme()].map(item).join('')}</div>
${c?`<div class="customTheme" aria-label="カスタムテーマ（${tone()==='dark'?'暗':'明'}）">${KEYS.map(k=>`<label>${LABELS[k]}<span><input type="color" data-color="${k}" value="${c[k].toLowerCase()}"><input data-hex="${k}" value="${c[k]}" maxlength="7" spellcheck="false" aria-label="${LABELS[k]}のカラーコード"></span></label>`).join('')}${low?'<p class="customWarning" role="status">文字と本文欄のコントラストが低く、読みにくい配色です。</p>':''}<button type="button" id="customReset">初期の色に戻す</button></div>`:''}
<button type="button" id="themeImport">テーマファイルを読み込む</button><input id="themeFile" type="file" accept=".json,application/json" hidden>
<label>背景画像</label><div class="bgActions"><button type="button" id="bgPick">画像を選ぶ</button><button type="button" id="bgNone"${image?'':' hidden'}>なし</button></div><input id="bgFile" type="file" accept="image/*" hidden>
<div class="bgControls"${image?'':' hidden'}><label>濃さ<input id="bgA" type="range" min="0" max="100" value="${Math.round(settings.bgA*100)}"></label><label>横の位置<input id="bgX" type="range" min="0" max="100" value="${settings.bgX}"></label><label>縦の位置<input id="bgY" type="range" min="0" max="100" value="${settings.bgY}"></label><label>拡大<input id="bgZ" type="range" min="100" max="300" value="${settings.bgZ}"></label><button type="button" id="bgReset">位置をもどす</button></div>`;
  }
  function bind(root,refresh){
    root.querySelectorAll('[data-tone]').forEach(b=>b.onclick=()=>{if(tone()!==b.dataset.tone)$('#theme').click();refresh()});
    root.querySelectorAll('[data-theme]').forEach(b=>b.onclick=()=>{selectTheme(b.dataset.theme);refresh()});
    root.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{removeTheme(b.dataset.remove);refresh()});
    root.querySelectorAll('[data-color]').forEach(el=>el.oninput=()=>{setCustom(el.dataset.color,el.value);const h=root.querySelector(`[data-hex="${el.dataset.color}"]`);if(h)h.value=el.value.toUpperCase()});
    root.querySelectorAll('[data-color]').forEach(el=>el.onchange=refresh);
    root.querySelectorAll('[data-hex]').forEach(el=>el.onchange=()=>{const v=el.value.trim().replace(/^#?/,'#');if(!setCustom(el.dataset.hex,v))toast('#RRGGBB の形で入力してください。');refresh()});
    root.querySelector('#customReset')?.addEventListener('click',()=>{resetCustom();refresh()});
    const themeFile=root.querySelector('#themeFile'),bgFile=root.querySelector('#bgFile');
    root.querySelector('#themeImport').onclick=()=>themeFile.click();
    themeFile.onchange=async()=>{const f=themeFile.files[0];themeFile.value='';if(!f)return;try{await importTheme(f);refresh()}catch(e){toast(e.message)}};
    root.querySelector('#bgPick').onclick=()=>bgFile.click();
    bgFile.onchange=async()=>{const f=bgFile.files[0];bgFile.value='';if(!f)return;try{await setBackground(f);refresh()}catch(e){toast(e.message)}};
    root.querySelector('#bgNone').onclick=async()=>{await clearBackground();refresh()};
    const k={bgA:v=>v/100,bgX:v=>v,bgY:v=>v,bgZ:v=>v};
    for(const id of Object.keys(k)){const el=root.querySelector('#'+id);el.oninput=()=>{settings[id]=k[id](Number(el.value));layout()};el.onchange=saveSettings}
    root.querySelector('#bgReset').onclick=()=>{settings.bgX=50;settings.bgY=50;settings.bgZ=100;saveSettings();layout();refresh()};
  }
  window.Appearance={fonts,loadFont,applyTheme,html,bind,ready,importTheme,selectTheme,setBackground,clearBackground,get theme(){return current()?.id||'default'}};
})();
