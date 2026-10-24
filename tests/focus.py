"""Focus/fullscreen navigation tests with independent storage and a local server."""
import functools,http.server,json,os,pathlib,shutil,threading
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=pathlib.Path(os.environ.get('TEST_OUTPUT_DIR','/tmp/ohanashi-focus-tests'));OUT.mkdir(parents=True,exist_ok=True)
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT/'dist')))
threading.Thread(target=server.serve_forever,daemon=True).start();checks=[]
def check(name,ok):
    assert ok,name
    checks.append(name);print('PASS',name,flush=True)
try:
 with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium'))
    ctx=browser.new_context(viewport={'width':1280,'height':900},has_touch=True)
    ctx.route('https://fonts.googleapis.com/**',lambda r:r.abort())
    page=ctx.new_page();page.goto('http://127.0.0.1:'+str(server.server_port));errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.evaluate("""()=>{state=validate({...initial,title:'章移動',chapters:[{id:'one',title:'第一章',text:'人「一」'},{id:'two',title:'第二章',text:'○二'},{id:'three',title:'第三章',text:'終わり'}]});active='one';render();resetHistory();save()}""")
    check('gesture is off by default',not page.locator('#focusGesture').is_visible())
    page.locator('#focus').click();check('focus has reachable onscreen exit',page.locator('#exitFocus').is_visible())
    before=page.evaluate('state.chapters.map(c=>c.cuts)')
    page.evaluate("()=>caretEnd($('#editor').lastElementChild)");page.keyboard.insert_text('未保存追記');page.evaluate('clearTimeout(timer)')
    check('test starts with pending autosave',page.evaluate('dirty'))
    page.keyboard.press('Alt+PageDown')
    check('chapter shortcut flushes unsaved changes and retains IDs',page.evaluate("active==='two'&&!dirty") and '未保存追記' in json.loads(page.evaluate('localStorage.getItem(KEY)'))['chapters'][0]['text'] and page.evaluate('state.chapters.map(c=>c.cuts)')==before)
    page.keyboard.press('Alt+PageUp');check('previous shortcut returns to first chapter',page.evaluate("active==='one'"))
    page.keyboard.press('Alt+PageUp');check('first chapter does not wrap',page.evaluate("active==='one'"))
    page.keyboard.press('Alt+PageDown');page.keyboard.press('Alt+PageDown');page.keyboard.press('Alt+PageDown');check('last chapter does not wrap',page.evaluate("active==='three'"))
    page.evaluate("()=>{composing=true}");page.keyboard.press('Alt+PageUp');check('composition flag blocks chapter movement',page.evaluate("active==='three'"));page.evaluate('composing=false')
    page.evaluate("()=>$('#editor').dispatchEvent(new KeyboardEvent('keydown',{key:'PageUp',altKey:true,isComposing:true,bubbles:true}))");check('IME keyboard event blocks movement',page.evaluate("active==='three'"))
    page.evaluate("()=>{caretEnd($('#editor').lastElementChild)}");page.keyboard.press('Shift+ArrowUp')
    check('Shift arrow remains text selection',page.evaluate("active==='three'&&!getSelection().isCollapsed"))
    page.evaluate("()=>modal('確認','<input id=otherInput>')");page.locator('#otherInput').focus();page.keyboard.press('Alt+PageUp');check('dialog input does not move chapter',page.evaluate("active==='three'"));page.locator('#close').click()
    page.locator('#exitFocus').click();check('exit button leaves focus mode',not page.evaluate("document.body.classList.contains('focus')"))
    page.locator('#editor').focus();page.keyboard.press('Alt+PageUp');check('normal editor does not intercept chapter shortcut',page.evaluate("active==='three'"))
    page.locator('#focus').click();page.evaluate("()=>{caretEnd($('#editor').lastElementChild)}");page.keyboard.insert_text('容量不足');page.evaluate("()=>{clearTimeout(timer);Storage.prototype.setItem=function(){throw new DOMException('quota','QuotaExceededError')}}")
    page.keyboard.press('Alt+PageUp');check('save failure aborts navigation and retains pending text',page.evaluate("active==='three'&&dirty&&chapter().text.endsWith('容量不足')"))
    page.reload();page.locator('#settings').click();page.locator('#pinchFocusToggle').check();page.locator('#close').click()
    check('explicit preference enables dedicated gesture handle',page.locator('#focusGesture').is_visible())
    page.reload();check('gesture preference persists separately from manuscript',page.locator('#focusGesture').is_visible())
    def pinch(start,end,cancel=False,ime=False):
      page.evaluate("""({start,end,cancel,ime})=>{
        composing=ime;const el=$('#focusGesture');
        const points=d=>[0,1].map(i=>new Touch({identifier:i,target:el,clientX:50+i*d,clientY:30}));
        el.dispatchEvent(new TouchEvent('touchstart',{touches:points(start),changedTouches:points(start)}));
        el.dispatchEvent(new TouchEvent('touchmove',{touches:points(end),changedTouches:points(end)}));
        el.dispatchEvent(new TouchEvent(cancel?'touchcancel':'touchend',{touches:[],changedTouches:points(end)}));composing=false;
      }""",dict(start=start,end=end,cancel=cancel,ime=ime))
    snapshot=page.evaluate('JSON.stringify(state)');pinch(50,90);check('dedicated pinch out enters focus',page.evaluate("document.body.classList.contains('focus')"));pinch(90,50);check('dedicated pinch in exits focus',not page.evaluate("document.body.classList.contains('focus')"))
    pinch(50,90,True);pinch(50,90,ime=True);pinch(50,55);check('cancel IME and tiny pinch do not toggle',not page.evaluate("document.body.classList.contains('focus')"))
    check('pinch leaves manuscript and history unchanged',page.evaluate('JSON.stringify(state)')==snapshot and page.evaluate('historyIndex===0'))
    check('editor keeps ordinary browser pinch zoom',page.locator('#editor').evaluate("e=>getComputedStyle(e).touchAction==='auto'"))
    page.locator('#focus').click();page.locator('#browserFullscreen').click();page.wait_for_function('!!document.fullscreenElement')
    check('browser fullscreen is distinct from app focus',page.evaluate("!!document.fullscreenElement&&document.body.classList.contains('focus')"))
    page.keyboard.press('Alt+PageDown');check('chapter navigation works in actual fullscreen',page.evaluate("active==='two'"))
    page.locator('#exitFocus').click();page.wait_for_function('!document.fullscreenElement');check('onscreen exit leaves actual fullscreen too',not page.evaluate("document.body.classList.contains('focus')"))
    page.evaluate("()=>{document.documentElement.requestFullscreen=()=>Promise.reject(Error('not allowed'))}");page.locator('#focus').click();page.locator('#browserFullscreen').click();check('fullscreen denial preserves usable focus exit',not page.evaluate('!!document.fullscreenElement') and page.locator('#exitFocus').is_visible())
    page.screenshot(path=str(OUT/'focus-desktop.png'));page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(OUT/'focus-phone.png'))
    check('mobile exit button is inside viewport',page.locator('#exitFocus').bounding_box()['x']+page.locator('#exitFocus').bounding_box()['width']<=390)
    check('no runtime errors',not errors);browser.close()
finally:server.shutdown();server.server_close()
(OUT/'checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2))
print(len(checks),'focus checks passed')
