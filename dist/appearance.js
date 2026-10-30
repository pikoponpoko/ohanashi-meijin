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

  // ---- colour themes ----
  const TONE_VARS=['--bg','--panel','--line','--text','--muted'];
  function validPack(p){
    return !!p&&typeof p==='object'&&p.format==='vconte-theme'&&typeof p.id==='string'&&p.id&&p.id!=='default'&&
      ['light','dark'].every(t=>p[t]&&p[t].app&&TONE_VARS.every(k=>hex(p[t].app[k])));
  }
  function packFrom(p){
    const tone=t=>Object.fromEntries(TONE_VARS.map(k=>[k,p[t].app[k].trim().toUpperCase()]));
    return {format:'vconte-theme',id:p.id,name:typeof p.name==='string'&&p.name.trim()?p.name.trim().slice(0,60):p.id,
      palette:Array.isArray(p.palette)?p.palette.filter(hex).slice(0,12):[],light:{app:tone('light')},dark:{app:tone('dark')}};
  }
  let themes=read(THEMES,[]);if(!Array.isArray(themes))themes=[];themes=themes.filter(validPack);
  const current=()=>themes.find(t=>t.id===settings.theme)||null;
  function applyTheme(){
    const body=document.body,pack=current(),names=['--bg','--paper','--ink','--muted','--line','--side','--done','--review','--todo'];
    names.forEach(n=>body.style.removeProperty(n));
    const meta=document.querySelector('meta[name=theme-color]');
    if(!pack){meta?.setAttribute('content',document.body.classList.contains('dark')?'#232323':'#eeefec');return}
    const a=pack[document.body.classList.contains('dark')?'dark':'light'].app;
    const vars={'--bg':a['--bg'],'--paper':a['--panel'],'--ink':a['--text'],'--muted':a['--muted'],'--line':a['--line'],'--side':a['--bg'],'--done':a['--text'],'--review':a['--muted'],'--todo':a['--line']};
    for(const [k,v] of Object.entries(vars))body.style.setProperty(k,v);
    meta?.setAttribute('content',a['--bg']);
  }
  async function importTheme(file){
    let pack;try{pack=JSON.parse(await file.text())}catch(_){throw Error('テーマファイルを読み込めません。')}
    if(!validPack(pack))throw Error('プリプロ名人のテーマファイル（.json）を選んでください。');
    pack=packFrom(pack);
    const next=[...themes.filter(t=>t.id!==pack.id),pack];
    if(!write(THEMES,next))throw Error('テーマを保存できません。');
    themes=next;settings.theme=pack.id;saveSettings();applyTheme();return pack;
  }
  function removeTheme(id){themes=themes.filter(t=>t.id!==id);write(THEMES,themes);if(settings.theme===id){settings.theme='default';saveSettings()}applyTheme()}
  function selectTheme(id){settings.theme=themes.some(t=>t.id===id)?id:'default';saveSettings();applyTheme()}

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
  const swatches=c=>c.slice(0,6).map(x=>`<i style="background:${x}"></i>`).join('');
  function html(){
    const items=[{id:'default',name:'デフォルト',palette:['#f6f6f4','#fcfcfa','#e2e2df','#898987','#30302f']},...themes];
    return `<label>テーマ</label><div class="themeList">${items.map(t=>`<div class="themeItem"><button type="button" class="themeChoice${t.id===(current()?.id||'default')?' on':''}" data-theme="${esc(t.id)}" aria-pressed="${t.id===(current()?.id||'default')}"><span class="themeSwatch">${swatches(t.palette)}</span><span>${esc(t.name)}</span></button>${t.id==='default'?'':`<button type="button" class="themeRemove" data-remove="${esc(t.id)}" aria-label="${esc(t.name)}を削除" title="削除">×</button>`}</div>`).join('')}</div>
<button type="button" id="themeImport">テーマを読み込む</button><input id="themeFile" type="file" accept=".json,application/json" hidden>
<label>背景画像</label><div class="bgActions"><button type="button" id="bgPick">画像を選ぶ</button><button type="button" id="bgNone"${image?'':' hidden'}>なし</button></div><input id="bgFile" type="file" accept="image/*" hidden>
<div class="bgControls"${image?'':' hidden'}><label>濃さ<input id="bgA" type="range" min="0" max="100" value="${Math.round(settings.bgA*100)}"></label><label>横の位置<input id="bgX" type="range" min="0" max="100" value="${settings.bgX}"></label><label>縦の位置<input id="bgY" type="range" min="0" max="100" value="${settings.bgY}"></label><label>拡大<input id="bgZ" type="range" min="100" max="300" value="${settings.bgZ}"></label><button type="button" id="bgReset">位置をもどす</button></div>`;
  }
  function bind(root,refresh){
    root.querySelectorAll('[data-theme]').forEach(b=>b.onclick=()=>{selectTheme(b.dataset.theme);refresh()});
    root.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{removeTheme(b.dataset.remove);refresh()});
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
