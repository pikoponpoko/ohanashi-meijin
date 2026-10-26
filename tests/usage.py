"""Usage feedback: isolated Chromium storage, native OPFS file handles, pointer/touch events."""
import functools,http.server,json,pathlib,shutil,threading,os
from playwright.sync_api import sync_playwright
from font_support import fonts
ROOT=pathlib.Path(__file__).resolve().parents[1];OUT=pathlib.Path('/tmp/ohanashi-usage-tests');OUT.mkdir(exist_ok=True)
class H(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*a):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(H,directory=str(ROOT/'dist')));threading.Thread(target=server.serve_forever,daemon=True).start();checks=[]
def check(name,ok):
 assert ok,name
 checks.append(name);print('PASS',name,flush=True)
try:
 with sync_playwright() as p:
  b=p.chromium.launch(executable_path=shutil.which('chromium'))
  for mobile in [False,True]:
   tag='mobile' if mobile else 'desktop';ctx=b.new_context(viewport={'width':390 if mobile else 1280,'height':844 if mobile else 900},has_touch=mobile,is_mobile=mobile,accept_downloads=True);fonts(ctx);page=ctx.new_page();page.goto('http://127.0.0.1:'+str(server.server_port));errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   def setup(text='前の本文。',direction='vertical'):
    page.evaluate("({text,direction})=>{state=validate({...initial,direction,title:'試験',chapters:[{id:'one',title:'第一章',text},{id:'two',title:'第二章',text:'第二章の本文'},{id:'three',title:'第三章',text:'第三章の本文'}]});active='one';render();resetHistory();save();FileControls.documentOpened();caretEnd($('#editor').lastElementChild)}",dict(text=text,direction=direction))
   def data():return page.evaluate('JSON.stringify(state)')
   for direction in ['vertical','horizontal']:
    setup(direction=direction);old=page.evaluate('chapter().cuts[0].id');page.keyboard.press('Enter');page.keyboard.press('Enter');page.keyboard.insert_text('続く本文。')
    check(tag+direction+' double Enter at end no blank',page.evaluate("chapter().text==='#C1\\n前の本文。\\n#C2\\n続く本文。'&&chapter().cuts.length===2"))
    check(tag+direction+' first cut ID retained',page.evaluate('chapter().cuts[0].id')==old)
    setup('前の本文。\n次の本文。',direction);page.evaluate("()=>{const p=$('#editor').lastElementChild,r=document.createRange();r.setStart(p.firstChild,0);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r)}");before=data();page.keyboard.press('Enter');page.keyboard.press('Enter')
    check(tag+direction+' double Enter before existing body no blank',page.evaluate("chapter().text==='#C1\\n前の本文。\\n#C2\\n次の本文。'"))
    split=data();page.keyboard.press('Control+z');page.keyboard.press('Control+z');check(tag+direction+' split Undo restores exact structure',data()==before)
    page.keyboard.press('Control+y');page.keyboard.press('Control+y');check(tag+direction+' split Redo restores IDs',data()==split)
    setup('前の本文。\n次の本文。',direction);page.evaluate("()=>caretEnd($('#editor').children[1])");page.keyboard.press('Enter');page.keyboard.press('Enter')
    check(tag+direction+' double Enter at line end before existing body no blank',page.evaluate("chapter().text==='#C1\\n前の本文。\\n#C2\\n次の本文。'"));page.keyboard.insert_text('続');check(tag+direction+' caret moves to following body',page.evaluate("chapter().text==='#C1\\n前の本文。\\n#C2\\n続次の本文。'"))
   setup('前\n\n\n後\n\n#C2\n\n末尾\n\n');ids=page.evaluate('chapter().cuts.map(c=>c.id)');check(tag+' one blank cleanup control',page.locator('[data-fix=blank]').is_enabled() and page.get_by_text('空行を削除',exact=True).count()==0);page.locator('[data-fix=blank]').click()
   check(tag+' keeps intentional gap removes cut-adjacent blanks',page.evaluate("chapter().text==='#C1\\n前\\n\\n後\\n#C2\\n末尾'") and page.evaluate('chapter().cuts.map(c=>c.id)')==ids)
   once=data();check(tag+' tidy is idempotent',page.locator('[data-fix=blank]').is_disabled());page.keyboard.press('Control+z');page.keyboard.press('Control+y');check(tag+' tidy Redo exact',data()==once)
   setup('自宅・和室（冬・朝５時・３０歳）\n15年前・ねこの大学生時代\n廊下（春・昼間）\nいろいろな場所・時間\n普通の本文。');page.evaluate("()=>{const c=chapter();c.formats=c.text.split('\\n').map((_,i)=>i?'action':null);c.formatOrigins=c.formats.map(k=>k?'legacy':null);render();resetHistory();save()}");before=data();page.locator('#autoFormat').click();page.locator('#acceptSceneCandidates').click();page.locator('#applyAutoFormat').click()
   check(tag+' repair legacy scene proposals internally and visually',page.evaluate("chapter().formats.slice(1,5).every(k=>k==='scene')&&chapter().formats[5]==='action'&&[...$('#editor').children].slice(1,5).every(p=>p.classList.contains('scene'))"))
   page.keyboard.press('Control+z');check(tag+' scene repair Undo exact',data()==before)
   setup('文章……続く……');page.evaluate('capture();save()');before=data();check(tag+' ellipsis markup',page.locator('#editor .verticalEllipsis').count()==2);page.evaluate('capture();save()');check(tag+' glyph and cut spacing leave data unchanged',data()==before)
   setup('本文');page.keyboard.insert_text('……');page.wait_for_timeout(80);check(tag+' newly typed ellipsis retains caret and native input',page.locator('#editor .verticalEllipsis').count()==1 and page.evaluate("chapter().text.endsWith('本文……')&&historySelection().start.offset===4"));page.keyboard.insert_text('続く');page.wait_for_timeout(80);check(tag+' typing continues after centered ellipsis',page.evaluate("chapter().text.endsWith('本文……続く')&&[...document.querySelectorAll('#editor .verticalEllipsis')].every(e=>/^[…⋯]+$/.test(e.textContent))"))
   setup();page.locator('#menu').click();anchor=page.locator('#menu').bounding_box();panel=page.locator('#chapterPanel').bounding_box();check(tag+' panel anchored within viewport',abs(panel['x']-max(8,min(anchor['x'],(390 if mobile else 1280)-panel['width']-8)))<2 and panel['x']>=0 and panel['x']+panel['width']<=(390 if mobile else 1280))
   check(tag+' arrows removed and drag handles exist',page.locator('#moveChapterEarlier').count()==0 and page.locator('.chapterHandle').count()==3)
   baseline=data();handles=page.locator('.chapterHandle');a=handles.nth(0).bounding_box();target=handles.nth(2).bounding_box()
   if not mobile:
    page.mouse.move(a['x']+10,a['y']+10);page.mouse.down();page.mouse.move(target['x']+10,target['y']+10,steps=10);page.mouse.up()
   else:
    cdp=ctx.new_cdp_session(page);cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':a['x']+10,'y':a['y']+10}]});cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':target['x']+10,'y':target['y']+10}]});cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
   check(tag+' pointer/touch reorders without switching active chapter',page.evaluate("state.chapters.map(c=>c.id).join(',')==='two,three,one'&&active==='one'"));page.locator('#closeChapters').click();page.keyboard.press('Control+z');check(tag+' reorder Undo exact',data()==baseline)
   # The actual browser filesystem write path, without touching user OS files.
   setup();page.evaluate("""async()=>{window.testHandle=await (await navigator.storage.getDirectory()).getFileHandle('same.json',{create:true});const w=await testHandle.createWritable();await w.write(JSON.stringify(state));await w.close();window.openCalls=0;window.saveCalls=0;window.showOpenFilePicker=async()=>{openCalls++;return [testHandle]};window.showSaveFilePicker=async()=>{saveCalls++;return await (await navigator.storage.getDirectory()).getFileHandle('as-new.json',{create:true})}}""")
   before=data();page.locator('#import').click();page.wait_for_function("openCalls===1&&document.querySelector('#fileStatus').textContent==='ファイル保存済み'");check(tag+' Open calls picker directly without intermediate dialog',not page.locator('#dialog').evaluate('e=>e.open') and data()==before)
   page.evaluate("()=>caretEnd($('#editor').lastElementChild)");page.keyboard.insert_text('追記');page.wait_for_timeout(450);check(tag+' browser autosave differs from file save',page.evaluate("!dirty&&FileControls.fileChanged()&&JSON.parse(localStorage.getItem(KEY)).chapters[0].text.endsWith('追記')") and '未保存' in page.locator('#fileStatus').inner_text())
   page.locator('#backup').click();page.wait_for_function('!FileControls.fileChanged()');check(tag+' Save overwrites same native file handle',page.evaluate("async()=>saveCalls===0&&JSON.parse(await (await testHandle.getFile()).text()).chapters[0].text===chapter().text"))
   page.locator('#saveAs').click();page.wait_for_function("saveCalls===1&&!document.querySelector('#backup').disabled");check(tag+' Save As selects a separate file',page.evaluate("async()=>JSON.parse(await (await (await navigator.storage.getDirectory()).getFileHandle('as-new.json')).getFile().then(f=>f.text())).chapters[0].text===chapter().text"))
   saved=data();page.evaluate("()=>{window.showSaveFilePicker=async()=>{throw new DOMException('cancel','AbortError')}}");check(tag+' cancelled Save As preserves data',page.evaluate('()=>FileControls.saveFile(true)')==False and data()==saved)
   page.evaluate("()=>{window.showOpenFilePicker=async()=>[{getFile:async()=>new File([JSON.stringify({...JSON.parse(await (await testHandle.getFile()).text()),title:'権限テスト'})],'same.json',{type:'application/json'}),createWritable:async()=>{throw new DOMException('denied','NotAllowedError')}}]}");page.locator('#import').click();page.wait_for_function("state.title==='権限テスト'");page.evaluate("()=>caretEnd($('#editor').lastElementChild)");page.keyboard.insert_text('保持する');unsaved=data();check(tag+' denied overwrite keeps unsaved manuscript',page.evaluate('()=>FileControls.saveFile()')==False and data()==unsaved and page.evaluate('FileControls.fileChanged()'))
   page.evaluate('save();window.showOpenFilePicker=undefined');before=data()
   with page.expect_file_chooser() as fc:page.locator('#import').click()
   fc.value.set_files([]);check(tag+' fallback Open directly invokes chooser and cancel keeps data',data()==before and not page.locator('#dialog').evaluate('e=>e.open'))
   stable=data();page.reload();check(tag+' reload recovers exact script and clears file association',data()==stable and page.locator('#backup').get_attribute('title')=='ファイルへ保存')
   check(tag+' no runtime errors',not errors);page.screenshot(path=str(OUT/(tag+'.png')));ctx.close()
  b.close()
finally:server.shutdown();server.server_close()
(OUT/'checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2));print(len(checks),'usage checks passed')
