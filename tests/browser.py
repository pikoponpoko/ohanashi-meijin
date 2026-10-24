import re
"""Run against a local static server: python tests/browser.py. Requires Playwright + Chromium."""
import json, pathlib, os, shutil
import fitz
from playwright.sync_api import sync_playwright
from font_support import fonts

def open_chapters(page):
    if page.locator('#chapterPanel').is_hidden():page.locator('#menu').click()
BASE=os.environ.get('TEST_BASE_URL','http://127.0.0.1:8766')
OUT=pathlib.Path(os.environ.get('TEST_OUTPUT_DIR','/tmp/ohanashi-tests'));OUT.mkdir(parents=True,exist_ok=True)
checks=[]
def check(name,condition=True):
    assert condition,name
    checks.append(name);print('PASS',name,flush=True)
def setup(page,text,chapters=None):
    page.evaluate('''({text,chapters})=>{state=validate({version:1,title:'試験作品',author:'作者',chapters:chapters||[{id:'legacy',title:'第一章',text,status:'見直し'}]});active=state.chapters[0].id;resetHistory();render();save()}''',{'text':text,'chapters':chapters})
def data(page):return page.evaluate('JSON.parse(JSON.stringify(state))')
def paste(page,text):
    page.evaluate('''text=>{const dt=new DataTransfer();dt.setData('text/plain',text);document.querySelector('#editor').dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}))}''',text)
def end(page,index=-1):page.evaluate('''i=>{const p=[...document.querySelector('#editor').children].at(i);caretEnd(p)}''',index)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium'),args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1280,'height':900},accept_downloads=True)
    # Exercise the application without relying on external font availability.
    fonts(page)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(BASE);page.wait_for_function('typeof historyIndex !== "undefined"')
    check('fresh launch has blank manuscript',data(page)['title']=='' and '余白' not in data(page)['chapters'][0]['text'])
    setup(page,'○駅（朝）\n　　　雨が降る。\n澪「こんにちは」\n\n\n\n末尾')
    before=data(page);page.reload();check('reload preserves existing manuscript and IDs',data(page)==before)
    # Repeated paste/render/capture is idempotent, including blank lines.
    expected=page.evaluate('chapter().text')
    page.evaluate('''()=>{for(let i=0;i<10;i++){renderText();capture()}}''')
    check('10 serialization cycles preserve text',page.evaluate('chapter().text')==expected)
    page.locator('#check').click();page.get_by_text('空行を整理',exact=True).click()
    check('repair removes multiplied blanks and preserves words/IDs',not '\n\n\n' in page.evaluate('chapter().text') and data(page)['chapters'][0]['cuts']==before['chapters'][0]['cuts'])
    # TXT through chapters 1-5 using the real clipboard event handler.
    text='○場（夜）\n　　　動作。\n花「言葉」\n\n終わり'
    setup(page,'');end(page);paste(page,text)
    original=page.evaluate('chapter().text')
    for i in range(4):
        open_chapters(page);page.locator('#add').click();page.locator('#newTitle').fill('章'+str(i+2));page.locator('#createChapter').click();end(page);paste(page,text)
    check('TXT through five chapters has equal structure',len({re.sub(r'^#C\d+$','',c['text'],flags=re.M) for c in data(page)['chapters']})==1)
    # Insert a cut between existing cuts; old IDs must survive.
    setup(page,'一\n#C7\n二\n#C19\n三');ids=[c['id'] for c in data(page)['chapters'][0]['cuts']]
    end(page,1);page.keyboard.press('Enter');page.keyboard.press('Enter');page.keyboard.insert_text('新規')
    now=data(page)['chapters'][0];check('Enter twice inserts consecutive cut with stable old IDs',[x['id'] for x in now['cuts']][::1][0]==ids[0] and [x['id'] for x in now['cuts']][2:]==ids[1:] and len(now['cuts'])==4)
    snapshot=data(page);page.keyboard.press('Control+z');page.keyboard.press('Control+Shift+z');check('keyboard Undo/Redo restores exact cut state',data(page)==snapshot)
    page.reload();check('cut IDs survive save/reload',data(page)==snapshot)
    # Whole-paragraph chapter split preserves semantic paragraph classes.
    setup(page,'○場\n　　　動作。\n花「言葉」\n#C9\n　　　次の動作。')
    movedid=data(page)['chapters'][0]['cuts'][1]['id']
    page.evaluate('''()=>{const ps=document.querySelector('#editor').children,r=document.createRange();r.setStartBefore(ps[2]);r.setEndAfter(ps[5]);getSelection().removeAllRanges();getSelection().addRange(r);document.dispatchEvent(new Event('selectionchange'))}''')
    open_chapters(page);page.locator('#splitChapter').click();page.locator('#confirmSplit').click()
    current=data(page);check('chapter split preserves dialogue/action and cut ID',len(current['chapters'])==2 and current['chapters'][1]['cuts'][1]['id']==movedid and '　　　動作。' in current['chapters'][1]['text'] and '花「言葉」' in current['chapters'][1]['text'])
    page.locator('#editor').press('Control+z');check('chapter split Undo restores original chapter',len(data(page)['chapters'])==1)
    page.locator('#editor').press('Control+Shift+z');check('chapter split Redo retains IDs',data(page)==current)
    # Partial scene paragraph selection preserves type, text order and surviving words.
    setup(page,'○長い場所（朝）\n　　　動作。')
    page.evaluate('''()=>{const p=document.querySelector('#editor').children[1],r=document.createRange();r.setStart(p.firstChild,2);r.setEnd(p.firstChild,5);getSelection().removeAllRanges();getSelection().addRange(r);document.dispatchEvent(new Event('selectionchange'))}''')
    open_chapters(page);page.locator('#splitChapter').click();page.locator('#confirmSplit').click();part=data(page)
    check('partial paragraph split keeps scene type',part['chapters'][1]['formats'][1]=='scene' and 'い場所' in part['chapters'][1]['text'])
    page.reload();check('partial paragraph type survives reload',page.evaluate('state.chapters[1].formats[1]')=='scene')
    # Delete has optional backup and can be undone; cancellation does nothing.
    previous=data(page);open_chapters(page);page.locator('#deleteChapter').click();page.locator('#close').click();check('delete cancellation unchanged',data(page)==previous)
    downloads=[];page.on('download',lambda d:downloads.append(d.suggested_filename));open_chapters(page);page.locator('#deleteChapter').click();page.locator('#confirmDelete').click();check('delete without backup only removes chosen chapter',len(data(page)['chapters'])==1 and not downloads)
    page.locator('#editor').press('Control+z');check('chapter deletion is undoable',data(page)==previous)
    open_chapters(page);page.locator('#deleteChapter').click();page.locator('#deleteBackup').check()
    with page.expect_download():page.locator('#confirmDelete').click()
    check('optional backup downloaded when selected',len(downloads)==1)
    # File picker no MIME restriction; contents are validated before restore.
    check('file picker unrestricted',page.locator('#file').get_attribute('accept') is None)
    previous=data(page);page.locator('#file').set_input_files({'name':'broken.JSON','mimeType':'application/octet-stream','buffer':b'{bad'})
    check('invalid JSON leaves manuscript unchanged',data(page)==previous)
    valid=json.dumps(previous,ensure_ascii=False).encode();page.locator('#file').set_input_files({'name':'backup.JSON','mimeType':'application/octet-stream','buffer':valid});page.wait_for_selector('#openWithoutSaving')
    page.locator('#close').click();check('restore cancellation unchanged',data(page)==previous)
    page.locator('#file').set_input_files({'name':'backup.JSON','mimeType':'application/octet-stream','buffer':valid})
    page.locator('#openWithoutSaving').click()
    check('uppercase JSON with generic MIME restores IDs',data(page)==previous)
    # Replacing a cross-paragraph range merges the surviving prefix and suffix.
    setup(page,'○場所\n　　　動作。\n花「言葉」')
    page.evaluate("""()=>{const ps=$('#editor').children,r=document.createRange();r.setStart(ps[1].firstChild,1);r.setEnd(ps[3].firstChild,1);getSelection().removeAllRanges();getSelection().addRange(r)}""")
    paste(page,'置換')
    check('cross-paragraph paste joins surviving words',page.evaluate('chapter().text')=='#C1\n○置換「言葉」')
    page.keyboard.insert_text('続き')
    check('paste caret stays before surviving suffix',page.evaluate('chapter().text')=='#C1\n○置換続き「言葉」')
    page.locator('#editor').press('Control+z');page.locator('#editor').press('Control+z')
    check('range replacement Undo restores all paragraphs',page.evaluate('chapter().text')=='#C1\n○場所\n　　　動作。\n花「言葉」')
    # Use the actual custom clipboard payload for copy, cut, repeated paste, and history.
    setup(page,'○場\n#C2\n　　　動作。')
    saved=data(page);moved_id=saved['chapters'][0]['cuts'][1]['id']
    def transfer(action):
        page.evaluate("""action=>{const ps=$('#editor').children,r=document.createRange();r.setStartBefore(ps[2]);r.setEndAfter(ps[3]);getSelection().removeAllRanges();getSelection().addRange(r);window.testClipboard=new DataTransfer();$('#editor').dispatchEvent(new ClipboardEvent(action,{clipboardData:window.testClipboard,bubbles:true,cancelable:true}))}""",action)
    def paste_custom():
        page.evaluate("""()=>{$('#editor').dispatchEvent(new ClipboardEvent('paste',{clipboardData:window.testClipboard,bubbles:true,cancelable:true}))}""")
    transfer('copy');end(page);paste_custom();copied=data(page)
    check('copy creates new cut ID and keeps paragraph type',len(copied['chapters'][0]['cuts'])==3 and copied['chapters'][0]['cuts'][2]['id']!=moved_id and copied['chapters'][0]['formats'][-1]=='action')
    setup(page,'○場\n#C2\n　　　動作。');saved=data(page);moved_id=saved['chapters'][0]['cuts'][1]['id'];transfer('cut')
    open_chapters(page);page.locator('#add').click();page.locator('#createChapter').click();end(page);paste_custom();moved=data(page)
    check('cut to another chapter retains ID',moved['chapters'][1]['cuts'][1]['id']==moved_id and len(moved['chapters'][0]['cuts'])==1)
    end(page);paste_custom();repeated=data(page)
    check('repeated cut-paste creates unique IDs',len({x['id'] for c in repeated['chapters'] for x in c['cuts']})==sum(len(c['cuts']) for c in repeated['chapters']))
    page.locator('#editor').press('Control+z');check('paste Undo restores moved cut state',data(page)==moved)
    page.locator('#editor').press('Control+z');page.locator('#editor').press('Control+z');page.locator('#editor').press('Control+z')
    check('cut and chapter creation Undo restore source IDs',data(page)==saved)
    # Removing the first boundary creates one stable replacement, including later captures.
    setup(page,'本文')
    page.evaluate("""()=>{$('#editor').firstChild.remove();capture()}""");stable=page.evaluate('chapter().cuts[0].id')
    page.evaluate('()=>{capture();capture()}')
    check('deleted first cut replacement ID stays stable',page.evaluate('chapter().cuts[0].id')==stable)
    page.locator('#theme').click();themed=data(page);page.locator('#editor').press('Control+z');page.locator('#editor').press('Control+Shift+z')
    check('display settings participate in project history',data(page)==themed)
    setup(page,'本文\n#C2\n続き')
    page.evaluate("""()=>{$('#editor').children[2].dataset.cutId=$('#editor').firstChild.dataset.cutId;capture()}""");deduped=data(page)
    page.evaluate('()=>{capture();capture()}')
    check('duplicate DOM IDs are repaired once and remain stable',data(page)==deduped and len({c['id'] for c in deduped['chapters'][0]['cuts']})==2)
    # Reject malformed custom metadata and safely use its plain text fallback.
    end(page);page.evaluate("""()=>{const dt=new DataTransfer();dt.setData('application/x-ohanashi',JSON.stringify({records:[{text:'不正',kind:'invalid',id:'bad'}]}));dt.setData('text/plain','通常本文');$('#editor').dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));ScriptModel.checkCuts(state.chapters);validate(state)}""")
    check('invalid custom clipboard falls back to plain text','通常本文' in page.evaluate('chapter().text'))
    # IME does not split cuts or run history mid-composition.
    end(page);page.evaluate("document.querySelector('#editor').dispatchEvent(new CompositionEvent('compositionstart'))")
    ids=page.evaluate('chapter().cuts.map(x=>x.id)');page.keyboard.press('Enter');check('IME Enter does not create cut',page.evaluate('chapter().cuts.map(x=>x.id)')==ids)
    page.evaluate("document.querySelector('#editor').dispatchEvent(new CompositionEvent('compositionend'))")
    # Direct PDF must download bytes without invoking window.print.
    setup(page,'○駅（朝）\n　　　雨が降る。\n花「こんにちは」\n'+('　　　長い章の本文。\n'*180))
    page.evaluate('()=>{window.printCalls=0;window.print=()=>{window.printCalls++}}')
    for cover in [False,True]:
        page.locator('#export').click();page.locator('#coverField').set_checked(cover)
        with page.expect_download(timeout=60000) as info:page.locator('#outPdf').click()
        info.value.save_as(OUT/('cover.pdf' if cover else 'body.pdf'))
        check('direct PDF cover='+str(cover),page.evaluate('window.printCalls')==0 and (OUT/('cover.pdf' if cover else 'body.pdf')).read_bytes().startswith(b'%PDF'))
    page.locator('#export').click();page.locator('#outPrint').click();page.wait_for_function('window.printCalls===1');check('Print uses browser print dialog')
    body_pages=len(fitz.open(OUT/'body.pdf'))
    for name,expected in [('body',body_pages),('cover',body_pages+1)]:
        pdf=fitz.open(OUT/(name+'.pdf'))
        check('PDF '+name+' opens as landscape A4 with expected pages',body_pages>1 and len(pdf)==expected and all(abs(p.rect.width-841.89)<1 and abs(p.rect.height-595.28)<1 for p in pdf))
    # A paragraph spanning pages must retain every character and semantic style.
    long_text='場所の長い説明。「こんにちは」、続く。'*100
    setup(page,'○場',chapters=[{'id':'long','title':'長文章','text':long_text},{'id':'last','title':'第二章','text':'○駅\n花「終わり」'}])
    page.evaluate("""()=>{chapter().formats=[null,'scene'];state.cover=false;render();save()}""")
    page.evaluate('()=>printProject(false)')
    check('long paragraph pagination keeps all text and types',page.evaluate("""()=>{const ps=[...$('#printRoot').querySelectorAll('.printbody p')];return ps.map(p=>p.textContent).join('')===state.chapters.map(c=>c.text.replaceAll('\\n','')).join('')&&ps.filter(p=>p.textContent.startsWith('場所')).every(p=>p.classList.contains('scene'))&&$('#printRoot').children.length>=3}"""))
    for font in ['Noto Serif JP','Noto Sans JP','Zen Old Mincho']:
        page.evaluate("""async font=>{state.font=font;apply();await printProject(false)}""",font)
        check('print layout remains inside page for '+font,page.evaluate("""()=>[...$('#printRoot').querySelectorAll('.printbody')].every(b=>b.scrollWidth<=b.clientWidth+2)"""))
    # Failed storage and damaged manuscripts never replace the last saved JSON.
    setup(page,'保存済み本文');saved_json=page.evaluate('localStorage.getItem(KEY)')
    page.evaluate("""()=>{chapter().cuts[0].line=99;save()}""")
    check('invalid in-memory structure does not overwrite saved manuscript',page.evaluate('localStorage.getItem(KEY)')==saved_json and page.locator('#saved').inner_text()=='保存失敗')
    page.reload();check('last valid manuscript recovers after failed save',page.evaluate('chapter().text')=='#C1\n保存済み本文')
    page.evaluate("""()=>{Storage.prototype.setItem=function(){throw new DOMException('Quota','QuotaExceededError')};chapter().text+='追記';save()}""")
    check('quota failure preserves stored JSON and reports unsaved changes',page.evaluate('localStorage.getItem(KEY)')==saved_json and page.evaluate('dirty'))
    before_restore=data(page)
    page.locator('#file').set_input_files({'name':'blocked.json','mimeType':'application/json','buffer':json.dumps({'chapters':[{'title':'別の章','text':'別の本文'}]}).encode()})
    page.locator('#openWithoutSaving').click()
    check('backup storage failure aborts restore without changing manuscript',data(page)==before_restore and page.evaluate('localStorage.getItem(KEY)')==saved_json)
    page.add_init_script("if(!sessionStorage.getItem('test-corruption')){localStorage.setItem('scenario-meijin-v1','{broken');sessionStorage.setItem('test-corruption','1')}");page.reload()
    page.evaluate("""()=>{chapter().title='変更';save()}""")
    check('corrupt saved data is protected from autosave',page.evaluate('loadBlocked') and page.evaluate('localStorage.getItem(KEY)')=='{broken')
    # Restore after corruption preserves original raw bytes separately.
    recovery={'version':1,'title':'復元作品','chapters':[{'id':'recover','title':'復元章','text':'本文'}]}
    page.locator('#file').set_input_files({'name':'recovery.json','mimeType':'application/json','buffer':json.dumps(recovery).encode()})
    page.locator('#openWithoutSaving').click()
    check('recovery keeps corrupt source and resumes saving',not page.evaluate('loadBlocked') and page.evaluate("archivedDocuments().some(x=>x.raw==='{broken')") and data(page)['title']=='復元作品')
    # Mobile drawer absorbs first tap; synthetic gestures use shared history.
    mobile=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True);m=mobile.new_page();fonts(m);m.goto(BASE);setup(m,'初め');end(m);m.keyboard.insert_text('追記');latest=data(m)
    m.locator('#menu').click();m.locator('#sidebarBackdrop').tap(position={'x':350,'y':400});check('mobile outside tap closes drawer without editing',m.evaluate("!document.body.classList.contains('mobilemenu')") and data(m)==latest)
    def gesture(fingers,moved=False):
        m.evaluate('''({fingers,moved})=>{const el=document.querySelector('#editor'),ts=Array.from({length:fingers},(_,i)=>new Touch({identifier:i,target:el,clientX:250+i*25,clientY:200}));el.dispatchEvent(new TouchEvent('touchstart',{touches:ts,changedTouches:ts,bubbles:true}));if(moved)el.dispatchEvent(new TouchEvent('touchmove',{touches:ts,changedTouches:ts.map(t=>new Touch({identifier:t.identifier,target:el,clientX:t.clientX+30,clientY:200})),bubbles:true}));el.dispatchEvent(new TouchEvent('touchend',{touches:[],changedTouches:ts,bubbles:true,cancelable:true}))}''',{'fingers':fingers,'moved':moved})
    gesture(2);check('two-finger tap Undo',data(m)!=latest);gesture(3);check('three-finger tap Redo',data(m)==latest);gesture(2,True);check('moving fingers does not Undo',data(m)==latest)
    check('no JavaScript runtime errors',not errors)
    page.screenshot(path=str(OUT/'desktop.png'));m.screenshot(path=str(OUT/'mobile.png'));browser.close()
print(str(len(checks))+' browser checks passed')
