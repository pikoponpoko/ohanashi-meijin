"""Focused release acceptance tests. Uses isolated browser contexts, never a user's profile."""
import json, os, pathlib, re, shutil
from playwright.sync_api import sync_playwright

def open_chapters(page):
    if page.locator('#chapterPanel').is_hidden():page.locator('#menu').click()

BASE=os.environ.get('TEST_BASE_URL','http://127.0.0.1:8766').rstrip('/')
OUT=pathlib.Path(os.environ.get('TEST_OUTPUT_DIR','test-results/release'));OUT.mkdir(parents=True,exist_ok=True)
checks=[]
def check(name,condition=True):
    assert condition,name
    checks.append(name);print('PASS',name,flush=True)
def data(page):return page.evaluate('JSON.parse(JSON.stringify(state))')
def setup(page,text):
    page.evaluate('''text=>{state=validate({version:1,title:'確認原稿',chapters:[{id:'release',title:'第一章',text}]});active=state.chapters[0].id;loadBlocked=false;resetHistory();render();save()}''',text)
def cleanup(page):
    page.locator('#check').click();page.get_by_text('空行を削除',exact=True).click()
def new_document(page):
    page.locator('#newDocument').click();page.locator('#confirmNewDocument').click()
def context(browser,**options):
    ctx=browser.new_context(**options)
    ctx.route('https://fonts.googleapis.com/**',lambda route:route.abort())
    return ctx

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium'))
    ctx=context(browser,viewport={'width':1280,'height':900});page=ctx.new_page();page.goto(BASE)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.wait_for_function('typeof historyIndex!=="undefined"')
    check('new profile is blank and counts zero body characters',data(page)['title']=='' and page.locator('#count').inner_text().startswith('0 字'))
    for blank in ['', ' ', '\u3000', '\t', '\u00a0', '\u200b', '\u2060']:
        setup(page,blank+'\n○場\n'+blank+'\n#C2\n'+blank+'\n人「中\u200b身」\n'+blank)
        before=data(page);ids=[c['id'] for c in before['chapters'][0]['cuts']]
        cleanup(page);clean=data(page)
        check('cleanup removes visual blanks '+repr(blank),clean['chapters'][0]['text']=='#C1\n○場\n#C2\n人「中\u200b身」' and [c['id'] for c in clean['chapters'][0]['cuts']]==ids)
        check('no rendered empty columns '+repr(blank),page.evaluate("[...$('#editor').children].every(p=>p.dataset.cutId||p.textContent.trim())"))
        page.locator('#editor').press('Control+z');check('cleanup is exactly one Undo '+repr(blank),data(page)==before)
        page.locator('#editor').press('Control+Shift+z');check('cleanup Redo exact '+repr(blank),data(page)==clean)
        page.evaluate('()=>{for(let i=0;i<10;i++){renderText();capture()}save()}');page.reload()
        after=data(page)['chapters'][0]
        check('cleanup stable through ten cycles and reload '+repr(blank),after['text']==clean['chapters'][0]['text'] and after['cuts']==clean['chapters'][0]['cuts'])
    setup(page,'#C1\n\n#C2\n')
    cleanup(page);empty=data(page)
    page.evaluate('()=>{for(let i=0;i<10;i++){renderText();capture()}save()}');page.reload()
    check('empty cuts preserved with only unsaved caret placeholder',data(page)==empty and empty['chapters'][0]['text']=='#C1\n#C2' and page.locator('#editor [data-placeholder]').count()==1)
    page.locator('#editor').press('End');page.evaluate('()=>caretEnd($("#editor").lastElementChild)');page.keyboard.insert_text('追記')
    check('caret placeholder accepts input without extra empty line',data(page)['chapters'][0]['text']=='#C1\n#C2\n追記')
    setup(page,'')
    page.evaluate('''()=>{$('#editor').innerHTML='<p class="cut" data-cut-id="dom" contenteditable="false">#C1</p><div>○場<br><br>人「言葉」<br></div><p><br></p>';capture()}''')
    cleanup(page)
    check('DOM BR and empty paragraph cleanup',data(page)['chapters'][0]['text']=='#C1\n○場\n人「言葉」' and page.evaluate("[...$('#editor').children].every(p=>p.textContent.trim())"))
    page.screenshot(path=str(OUT/'cleanup.png'))

    # Requirement 1: actual cut/copy clipboard records through five chapters.
    setup(page,'○駅\n　　　動作\n人「言葉」')
    def select_all_text():page.evaluate('''()=>{const r=document.createRange();r.selectNodeContents($('#editor'));getSelection().removeAllRanges();getSelection().addRange(r)}''')
    for i in range(4):
        select_all_text();action='copy' if i%2==0 else 'cut'
        page.evaluate('''action=>{window.releaseClipboard=new DataTransfer();$('#editor').dispatchEvent(new ClipboardEvent(action,{clipboardData:releaseClipboard,bubbles:true,cancelable:true}))}''',action)
        open_chapters(page);page.locator('#add').click();page.locator('#createChapter').click()
        page.evaluate('''()=>{caretEnd($('#editor').lastElementChild);$('#editor').dispatchEvent(new ClipboardEvent('paste',{clipboardData:releaseClipboard,bubbles:true,cancelable:true}))}''')
        check('chapter transfer keeps body and column styles '+str(i+2),page.evaluate("chapter().text.replace(/^#C\\d+$/gm,'').trim()==='○駅\\n　　　動作\\n人「言葉」' && [...$('#editor').querySelectorAll('p:not(.cut)')].filter(p=>p.textContent.trim()).map(p=>getComputedStyle(p).lineHeight).every(x=>x===getComputedStyle($('#editor')).lineHeight)"))
    check('all chapter/cut IDs remain unique',page.evaluate('''()=>new Set(state.chapters.flatMap(c=>c.cuts.map(x=>x.id))).size===state.chapters.flatMap(c=>c.cuts).length'''))

    # New-document transition archives exact IDs/state and never silently deletes old data.
    for title in ['余白の向こう','余白の向こう（編集済み）','通常原稿']:
        setup(page,'○場\n人「保存する」')
        page.evaluate('title=>{state.title=title;save()}',title)
        page.locator('#newDocument').click();old=data(page)
        page.locator('#confirmNewDocument').click()
        check('new document blank with original archived '+title,data(page)['title']=='' and page.locator('#count').inner_text().startswith('0 字') and page.evaluate('''old=>archivedDocuments().some(x=>JSON.stringify(JSON.parse(x.raw))===JSON.stringify(old))''',old))
        page.reload();page.locator('#savedDocuments').click()
        page.get_by_role('button',name=re.compile(re.escape(title)+' ·')).first.click()
        check('archive reopens exact manuscript and IDs '+title,data(page)==old)
    setup(page,'容量不足でも残す');before=data(page);raw=page.evaluate('localStorage.getItem(KEY)')
    page.evaluate("()=>{Storage.prototype.setItem=function(){throw new DOMException('quota','QuotaExceededError')}}")
    new_document(page)
    check('archive failure aborts new document',data(page)==before and page.evaluate('localStorage.getItem(KEY)')==raw)
    page.reload()
    # Fail the second write after the archive was saved.
    before=data(page);raw=page.evaluate('localStorage.getItem(KEY)')
    page.evaluate("""()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===KEY)throw new DOMException('quota','QuotaExceededError');return original.call(this,k,v)}}""")
    new_document(page)
    check('active-key failure retains current state and recovery snapshot',data(page)==before and page.evaluate('localStorage.getItem(KEY)')==raw)
    page.reload()
    corrupt=context(browser);corrupt.add_init_script("if(!sessionStorage.getItem('seed')){localStorage.setItem('scenario-meijin-v1','{broken');sessionStorage.setItem('seed','1')}")
    bad=corrupt.new_page();bad.goto(BASE);new_document(bad)
    check('corrupt raw bytes archived before blank start',bad.evaluate("!loadBlocked&&archivedDocuments().some(x=>x.raw==='{broken')"))
    bad.locator('#savedDocuments').click()
    with bad.expect_download() as download:bad.get_by_role('button',name='読み取れない原稿のJSONを保存').click()
    download.value.save_as(OUT/'corrupt-recovery.json')
    check('corrupt archive downloads original bytes',(OUT/'corrupt-recovery.json').read_bytes()==b'{broken')

    # PWA real registration, browser manifest parser, offline shell, data preservation.
    page.evaluate("""async()=>{
      let timer;
      try { window.pwaRegistration=await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('SW ready timeout')),10000)})
      ]); } finally { clearTimeout(timer); }
    }""")
    page.wait_for_function('window.pwaRegistration.active?.state === "activated"',timeout=10000)
    page.reload();page.wait_for_function('navigator.serviceWorker.controller!==null')
    manifest=page.context.new_cdp_session(page).send('Page.getAppManifest')
    check('browser parses manifest without errors',manifest['url'].endswith('manifest.webmanifest') and not manifest['errors'] and json.loads(manifest['data'])['display']=='standalone')
    for size in [192,512]:
        check('browser decodes '+str(size)+' icon',page.evaluate('''size=>new Promise(resolve=>{const i=new Image();i.onload=()=>resolve(i.naturalWidth===size&&i.naturalHeight===size);i.onerror=()=>resolve(false);i.src='icons/icon-'+size+'.png'})''',size))
    setup(page,'○場\n人「オフライン」');before=data(page)
    ctx.set_offline(True);page.reload()
    check('offline reload keeps manuscript and IDs',data(page)==before)
    page.evaluate('()=>caretEnd($("#editor").lastElementChild)');page.keyboard.insert_text('続き');offline=data(page);page.reload()
    check('offline editing persists',data(page)==offline)
    ctx.set_offline(False)
    page.screenshot(path=str(OUT/'desktop.png'))

    # Physical touch injection is trusted Chromium input; it is still not Android/iOS OS input.
    for width,height in [(390,844),(844,390)]:
        mobile=context(browser,viewport={'width':width,'height':height},is_mobile=True,has_touch=True)
        m=mobile.new_page();m.goto(BASE);setup(m,'初め');m.evaluate('()=>caretEnd($("#editor").lastElementChild)');m.keyboard.insert_text('追記');latest=data(m)
        m.locator('#menu').click();m.locator('#sidebarBackdrop').tap(position={'x':width-10,'y':height-30})
        check('drawer closes without edit portrait/landscape '+str(width),m.evaluate("!document.body.classList.contains('mobilemenu')") and data(m)==latest)
        cdp=mobile.new_cdp_session(m)
        box=m.locator('#editor').bounding_box();x=box['x']+60;y=box['y']+30
        def tap(fingers):
            cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x+i*25,'y':y,'id':i} for i in range(fingers)]})
            cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
        tap(2);check('trusted two-finger Undo '+str(width),data(m)!=latest)
        tap(3);check('trusted three-finger Redo '+str(width),data(m)==latest)
        # Synthetic edge cases with controlled timings and browser delivery.
        for mode in ['move','long','late','cancel','ime','dialog','four','sidebar']:
            m.evaluate('''mode=>{
              const el=$('#editor');if(mode==='ime')composing=true;if(mode==='dialog')modal('確認','');if(mode==='sidebar')document.body.classList.add('mobilemenu');
              const ts=Array.from({length:mode==='four'?4:2},(_,i)=>new Touch({identifier:i,target:el,clientX:250+i*25,clientY:200}));
              el.dispatchEvent(new TouchEvent('touchstart',{touches:ts,changedTouches:ts,bubbles:true}));
              if(mode==='long'&&gesture)gesture.time-=400;
              if(mode==='late'&&gesture){gesture.time-=150;const t=new Touch({identifier:3,target:el,clientX:300,clientY:200});el.dispatchEvent(new TouchEvent('touchstart',{touches:[...ts,t],changedTouches:[t]}))}
              if(mode==='move')el.dispatchEvent(new TouchEvent('touchmove',{touches:ts,changedTouches:ts.map(t=>new Touch({identifier:t.identifier,target:el,clientX:t.clientX+40,clientY:200}))}));
              if(mode==='cancel')el.dispatchEvent(new TouchEvent('touchcancel'));
              el.dispatchEvent(new TouchEvent('touchend',{touches:[],changedTouches:ts,cancelable:true}));
              composing=false;if($('#dialog').open)$('#dialog').close();document.body.classList.remove('mobilemenu');
            }''',mode)
            check('gesture rejects '+mode+' '+str(width),data(m)==latest)
        m.screenshot(path=str(OUT/('phone-'+str(width)+'.png')))
    check('no runtime errors',not errors)
    browser.close()
(OUT/'checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf-8')
print(str(len(checks))+' release checks passed')
