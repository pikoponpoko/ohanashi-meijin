"""Immediate empty cut, speaker entry and formatting marker conversion."""
import functools,http.server,pathlib,shutil,threading,json
from playwright.sync_api import sync_playwright
from font_support import fonts
ROOT=pathlib.Path(__file__).resolve().parents[1];OUT=pathlib.Path('/tmp/ohanashi-editing-followup');OUT.mkdir(exist_ok=True)
class H(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*a):pass
s=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(H,directory=str(ROOT/'dist')));threading.Thread(target=s.serve_forever,daemon=True).start();checks=[]
def check(name,ok):
 assert ok,name
 checks.append(name);print('PASS',name,flush=True)
try:
 with sync_playwright() as p:
  b=p.chromium.launch(executable_path=shutil.which('chromium'))
  for mobile in [False,True]:
   ctx=b.new_context(viewport={'width':390 if mobile else 1280,'height':844 if mobile else 900},is_mobile=mobile,has_touch=mobile);fonts(ctx);page=ctx.new_page();page.goto('http://127.0.0.1:'+str(s.server_port));tag='mobile' if mobile else 'desktop'
   def setup(text='本文',direction='vertical'):
    page.evaluate("({text,direction})=>{state=validate({...initial,direction,title:'編集確認',chapters:[{id:'one',title:'章',text}]});active='one';render();resetHistory();save();caretEnd($('#editor').lastElementChild)}",dict(text=text,direction=direction))
   def state():return page.evaluate('JSON.stringify(state)')
   for direction in ['vertical','horizontal']:
    name=tag+' '+direction;setup(direction=direction);before=state();page.keyboard.press('Enter');page.keyboard.press('Enter')
    check(name+' cut visible immediately before any typing',page.locator('#editor .cut:visible').count()==2)
    check(name+' separator saved without blank paragraph',page.evaluate("chapter().text==='#C1\\n本文\\n#C2'&&chapter().pendingCutId===chapter().cuts[1].id"))
    page.screenshot(path=str(OUT/(tag+'-'+direction+'-pending.png')));pending=state();page.keyboard.press('Control+z');page.keyboard.press('Control+z');check(name+' double Enter Undo exact',state()==before);page.keyboard.press('Control+y');page.keyboard.press('Control+y');check(name+' pending cut Redo exact',state()==pending)
    page.evaluate('save()');page.reload();check(name+' pending empty cut survives reload with same ID',state()==pending and page.locator('#editor .cut:visible').count()==2)
    page.evaluate("()=>caretEnd($('#editor').lastElementChild)");page.keyboard.insert_text('次の本文');check(name+' typing reuses pending ID without extra blank',page.evaluate("chapter().text==='#C1\\n本文\\n#C2\\n次の本文'&&!chapter().pendingCutId") and page.evaluate('chapter().cuts[1].id')==json.loads(pending)['chapters'][0]['cuts'][1]['id'])
    setup('太郎「本文」',direction);page.evaluate("()=>{const p=$('#editor').lastElementChild,r=document.createRange();r.setStart(p.firstChild,p.firstChild.length-1);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r)}");page.keyboard.press('Enter');page.keyboard.press('Enter');check(name+' double Enter inside speech closes wrapper and creates cut',page.evaluate("chapter().text==='#C1\\n太郎「本文」\\n#C2'") and page.locator('#editor .cut:visible').count()==2)
    setup('',direction);page.locator('[data-insert=dialogue]').click();page.locator('#speaker').click();cdp=ctx.new_cdp_session(page);
    for text in ['ｔ','た','たろ','たろう']:cdp.send('Input.imeSetComposition',{'text':text,'selectionStart':len(text),'selectionEnd':len(text)})
    check(name+' speaker IME remains in dialog',page.locator('#dialog').evaluate('e=>e.open'));cdp.send('Input.insertText',{'text':'太郎'});page.evaluate("()=>{const i=$('#speakerName');i.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))}");check(name+' IME confirmation does not submit speaker dialog',page.locator('#dialog').evaluate('e=>e.open'));page.locator('#applySpeaker').click();page.keyboard.insert_text('こんにちは')
    check(name+' speaker and speech entered separately',page.evaluate("chapter().text==='#C1\\n太郎「こんにちは」'"))
    original=state();page.locator('[data-insert=action]').click();check(name+' dialogue conversion removes only outer quotes',page.evaluate("chapter().text==='#C1\\n太郎こんにちは'&&chapter().formats[1]==='action'"));page.keyboard.press('Control+z');check(name+' format conversion Undo exact',state()==original)
    setup('◯場所',direction);page.locator('[data-insert=action]').click();check(name+' scene conversion removes circle',page.evaluate("chapter().text==='#C1\\n場所'"))
    setup('◯場所',direction);page.evaluate("()=>{const p=$('#editor').lastElementChild,r=document.createRange();r.setStart(p.firstChild,2);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r)}");page.locator('[data-insert=action]').click();check(name+' caret stays at same body position after marker removal',page.evaluate('historySelection().start.offset===1'))
    setup('太郎「彼は「はい」と言った」',direction);page.locator('[data-insert=action]').click();check(name+' inner quotations preserved',page.evaluate("chapter().text==='#C1\\n太郎彼は「はい」と言った'"))
  b.close()
finally:s.shutdown();s.server_close()
(OUT/'checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2));print(len(checks),'editing followup checks passed')
