"""Native Chromium editing/composition regression. OS IME candidate UI is not automated."""
import functools, http.server, json, pathlib, shutil, threading
from playwright.sync_api import sync_playwright
from font_support import fonts
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=pathlib.Path('/tmp/ohanashi-input-checks');OUT.mkdir(exist_ok=True)
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT/'dist')))
threading.Thread(target=server.serve_forever,daemon=True).start()
checks=[]
def check(name,ok):
 assert ok,name
 checks.append(name);print('PASS',name,flush=True)
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=shutil.which('chromium'))
  for mobile in [False,True]:
   ctx=browser.new_context(viewport={'width':390 if mobile else 1280,'height':844 if mobile else 900},is_mobile=mobile,has_touch=mobile);fonts(ctx)
   page=ctx.new_page();page.goto('http://127.0.0.1:'+str(server.server_port));cdp=ctx.new_cdp_session(page)
   errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   def setup(text='',direction='vertical'):
    page.evaluate("""({text,direction})=>{state=validate({...initial,direction,title:'入力試験',chapters:[{id:'test',title:'章',text}]});active='test';render();resetHistory();save();caretEnd($('#editor').lastElementChild);if(!window.inputTraceInstalled){for(const type of ['compositionstart','compositionend','beforeinput'])$('#editor').addEventListener(type,e=>trace.push({type:e.type,inputType:e.inputType,prevented:e.defaultPrevented}));window.inputTraceInstalled=true}window.trace=[]}""",{'text':text,'direction':direction})
   def body():return page.evaluate("chapter().text.split('\\n').filter((_,i)=>!chapter().cuts.some(c=>c.line===i)).join('\\n')")
   def state():return page.evaluate('JSON.stringify(state)')
   def position(offset,index=-1):
    page.evaluate("""({offset,index})=>{const p=[...$('#editor').children].at(index),w=document.createTreeWalker(p,NodeFilter.SHOW_TEXT);let n,left=offset;while(n=w.nextNode()){if(left<=n.length){const r=document.createRange();r.setStart(n,left);r.collapse(true);$('#editor').focus();getSelection().removeAllRanges();getSelection().addRange(r);return}left-=n.length}throw Error('bad caret offset')}""",{'offset':offset,'index':index})
   def select(start,end,index=-1):
    page.evaluate("""({start,end,index})=>{const p=[...$('#editor').children].at(index),r=document.createRange();r.setStart(p.firstChild,start);r.setEnd(p.firstChild,end);$('#editor').focus();getSelection().removeAllRanges();getSelection().addRange(r)}""",{'start':start,'end':end,'index':index})
   def compose(candidates,committed):
    before=state()
    for text in candidates:cdp.send('Input.imeSetComposition',{'text':text,'selectionStart':len(text),'selectionEnd':len(text)})
    unchanged=state()==before
    cdp.send('Input.insertText',{'text':committed})
    return unchanged
   for direction in ['vertical','horizontal']:
    tag=('mobile viewport ' if mobile else 'desktop ')+direction
    setup('あいうえお',direction);page.keyboard.press('Backspace');page.keyboard.press('Backspace')
    check(tag+' native Backspace',body()=='あいう')
    setup('あいうえお',direction);position(0);page.keyboard.press('Delete');page.keyboard.press('Delete')
    check(tag+' native Delete',body()=='うえお')
    setup('あいうえお',direction);select(1,4);page.keyboard.press('Backspace')
    check(tag+' selected deletion',body()=='あお')
    setup('あいうえお',direction);select(1,4);page.keyboard.press('Delete')
    check(tag+' selected forward deletion',body()=='あお')
    for key in ['Backspace','Delete']:
     setup('あいう\n#C2\nかきく',direction);before=state();page.keyboard.press('Control+a');page.keyboard.press(key)
     check(tag+' all cuts selected '+key,body()=='' and page.locator('#editor p:not([data-cut-id])').count()>=1 and page.evaluate('chapter().cuts.length')==1)
     check(tag+' Undo all deletion '+key,(page.keyboard.press('Control+z') is None) and state()==before)
     page.keyboard.press('Control+y');check(tag+' Redo all deletion '+key,body()=='')
     check(tag+' composition after clear '+key,compose(['ｔ','て','てｓ','てす','てすｔ','てすと'],'テスト') and body()=='テスト')
    setup('',direction)
    check(tag+' first romaji composition',compose(['ｔ','て','てｓ','てす','てすｔ','てすと'],'テスト') and body()=='テスト')
    check(tag+' one start/end per composition',page.evaluate("trace.filter(e=>e.type==='compositionstart').length===1&&trace.filter(e=>e.type==='compositionend').length===1"))
    page.keyboard.press('Enter')
    check(tag+' continuous Japanese after Enter',compose(['ｋ','こ','こん','こんに','こんにち','こんにちは'],'こんにちは') and body()=='テスト\nこんにちは')
    page.keyboard.press('Enter')
    check(tag+' kanji candidate update and commit',compose(['ｋ','きょ','きょう','きょうは','きょうはいいてんきです','今日はいい天気です'],'今日はいい天気です') and body().endswith('今日はいい天気です'))
    check(tag+' native composition not prevented',page.evaluate("trace.filter(e=>e.type.startsWith('composition')||e.inputType==='insertCompositionText').every(e=>!e.prevented)"))
    before=state();page.keyboard.press('Control+z');check(tag+' committed IME Undo',not body().endswith('今日はいい天気です'))
    page.keyboard.press('Control+y');check(tag+' committed IME Redo',state()==before)
    setup('あいうえお',direction);position(2);compose(['ｔ','てすと'],'テスト');page.keyboard.press('Backspace');page.keyboard.press('Delete')
    check(tag+' insertion and deletion in middle',body()=='あいテスえお')
    setup('12！？日本語',direction);position(2);page.keyboard.press('Backspace');check(tag+' TCY deletion',body()=='1！？日本語')
    setup('前\n#C2\n後',direction);before=state();position(0);page.keyboard.press('Backspace')
    check(tag+' Backspace across atomic cut keeps body',body()=='前\n後' and page.evaluate('chapter().cuts.length')==1)
    page.keyboard.press('Control+z');check(tag+' Undo restores cut ID',state()==before)
    position(1,1);page.keyboard.press('Delete');check(tag+' Delete across atomic cut keeps body',body()=='前\n後' and page.evaluate('chapter().cuts.length')==1)
    # Soft-keyboard beforeinput-only deletion path (event simulation, no physical keyboard).
    setup('前\n#C2\n後',direction);page.keyboard.press('Control+a')
    page.evaluate("$('#editor').dispatchEvent(new InputEvent('beforeinput',{inputType:'deleteContentBackward',bubbles:true,cancelable:true}))")
    check(tag+' beforeinput-only range deletion',body()=='' and page.evaluate('chapter().cuts.length')==1)
    compose(['ｔ','てすと'],'テスト');before=state();page.evaluate('save()');page.reload()
    check(tag+' reload preserves input and cut ID',state()==before)
    setup('',direction);page.locator('#editor').blur();page.locator('#editor').focus();compose(['ｔ','てすと'],'テスト')
    check(tag+' direct editor focus starts IME correctly',body()=='テスト')
   check(('mobile' if mobile else 'desktop')+' no script exceptions',not errors)
   page.screenshot(path=str(OUT/('mobile.png' if mobile else 'desktop.png')));ctx.close()
  browser.close()
finally:server.shutdown();server.server_close()
(OUT/'checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2))
print(len(checks),'input/composition checks passed')
