"""Sound kinds and focus chrome: isolated desktop/touch contexts, native Chromium fullscreen."""
import functools,http.server,json,pathlib,shutil,threading
from playwright.sync_api import sync_playwright
from font_support import fonts
ROOT=pathlib.Path(__file__).resolve().parents[1];OUT=pathlib.Path('/tmp/ohanashi-sound-tests');OUT.mkdir(exist_ok=True)
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
   tag='mobile' if mobile else 'desktop';ctx=b.new_context(viewport={'width':390 if mobile else 1280,'height':844 if mobile else 900},is_mobile=mobile,has_touch=mobile,accept_downloads=True);fonts(ctx);page=ctx.new_page();page.goto('http://127.0.0.1:'+str(s.server_port));errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   def setup(text='本文'):
    page.evaluate("text=>{state=validate({...initial,title:'音響確認',chapters:[{id:'one',title:'日常',text},{id:'two',title:'次の章',text:'　　　次の本文。'}]});active='one';render();resetHistory();save();caretEnd($('#editor').lastElementChild)}",text)
   def data():return page.evaluate('JSON.stringify(state)')
   def select_all_body():
    page.evaluate("()=>{const ed=$('#editor'),r=document.createRange();r.setStart(ed.children[1],0);r.setEnd(ed.lastElementChild,ed.lastElementChild.childNodes.length);getSelection().removeAllRanges();getSelection().addRange(r)}")
   setup();before=data();page.locator('#cueType').select_option('music')
   check(tag+' music distinct in DOM and compatible JSON',page.evaluate("chapter().text==='#C1\\n音楽：本文'&&chapter().formats[1]==='action'&&chapter().soundCues.entries[0].kind==='music'&&$('#editor').lastElementChild.dataset.kind==='music'"))
   music=data();page.keyboard.press('Control+z');check(tag+' sound conversion one Undo',data()==before);page.keyboard.press('Control+y');check(tag+' sound conversion Redo exact',data()==music)
   page.locator('#cueType').select_option('se');check(tag+' music to SE has one prefix',page.evaluate("chapter().text==='#C1\\nSE：本文'&&chapter().soundCues.entries[0].kind==='se'"))
   page.locator('[data-insert=dialogue]').click();check(tag+' sound to dialogue removes only type marker',page.evaluate("chapter().text==='#C1\\n「本文」'&&chapter().formats[1]==='dialogue'&&chapter().soundCues.entries.length===0"))
   setup('');page.locator('#cueType').select_option('music');page.keyboard.insert_text('穏やかな曲……');page.wait_for_timeout(80)
   check(tag+' empty cue accepts text and ellipsis without extra rows',page.evaluate("chapter().text==='#C1\\n音楽：穏やかな曲……'&&chapter().soundCues.entries[0].raw==='音楽：穏やかな曲……'&&$('#editor').children.length===2"))
   page.keyboard.press('Enter');page.locator('#cueType').select_option('se');page.keyboard.insert_text('足音');page.wait_for_timeout(400);saved=data();page.reload();check(tag+' save reload preserves sound types IDs and raw',data()==saved and page.locator('#editor .music').count()==1 and page.locator('#editor .se').count()==1)
   setup('音楽「古い曲」');before=data();check(tag+' legacy quoted sound stays unchanged before explicit conversion',page.evaluate("chapter().formats?.[1]!=='music'&&chapter().soundCues===undefined"));page.locator('#cueType').select_option('music');check(tag+' explicit legacy conversion preserves description',page.evaluate("chapter().text==='#C1\\n音楽：古い曲'&&chapter().soundCues.entries[0].kind==='music'"));page.keyboard.press('Control+z');check(tag+' legacy conversion Undo exact',data()==before)
   setup('一段落\n二段落');before=data();select_all_body();page.locator('#cueType').select_option('se');check(tag+' batch cue conversion keeps paragraphs',page.evaluate("chapter().text==='#C1\\nSE：一段落\\nSE：二段落'&&chapter().soundCues.entries.length===2"));page.keyboard.press('Control+z');check(tag+' batch cue Undo exact',data()==before)
   setup('SE：風');page.evaluate("()=>{const r=document.createRange();r.selectNodeContents($('#editor').lastElementChild);getSelection().removeAllRanges();getSelection().addRange(r)}");page.keyboard.insert_text('本文に戻す');check(tag+' deleting cue prefix returns to prose consistently',page.evaluate("chapter().soundCues.entries.length===0&&$('#editor').lastElementChild.dataset.kind==='action'"))
   setup('音楽：曲\nSE：足音');select_all_body();page.evaluate("()=>{window.cueClipboard=new DataTransfer();$('#editor').dispatchEvent(new ClipboardEvent('copy',{clipboardData:cueClipboard,bubbles:true,cancelable:true}));$('#editor').dispatchEvent(new ClipboardEvent('paste',{clipboardData:cueClipboard,bubbles:true,cancelable:true}))}")
   check(tag+' clipboard preserves independent sound types',page.evaluate("chapter().text==='#C1\\n音楽：曲\\nSE：足音'&&chapter().soundCues.entries.map(q=>q.kind).join(',')==='music,se'"))
   page.evaluate("()=>{window.showSaveFilePicker=async()=>({createWritable:async()=>({write:async text=>window.soundFile=text,close:async()=>{}})})}");page.locator('#backup').click();page.wait_for_function('!!window.soundFile');check(tag+' saved JSON keeps metadata and compatible formats',page.evaluate("JSON.parse(soundFile).chapters[0].soundCues.entries.length===2&&JSON.parse(soundFile).chapters[0].formats.slice(1).every(k=>k==='action')"))
   before=data();page.evaluate("async()=>{window.print=()=>{};await printProject(false)}");check(tag+' print preserves music and SE types',page.locator('.printbody .music').count()==1 and page.locator('.printbody .se').count()==1 and data()==before)
   page.screenshot(path=str(OUT/(tag+'-sound.png')))
   check(tag+' cut spacing is before number column',page.locator('#editor .cut').first.evaluate("e=>{const c=getComputedStyle(e);return Math.abs(parseFloat(c.marginRight)-parseFloat(c.fontSize)*.5)<1&&Math.abs(parseFloat(c.marginLeft)-parseFloat(c.fontSize))<1}"))
   setup('音楽：曲「未完\nSE：足音');page.evaluate('capture()');check(tag+' sound quotes do not open spoken composition context',page.evaluate("chapter().soundCues.entries.length===2&&$('#editor').lastElementChild.dataset.kind==='se'"))
   setup('音楽：静かな曲…');page.locator('#check').click();page.locator('[data-group]').click();check(tag+' autocorrection updates cue witness without losing kind',page.evaluate("chapter().soundCues.entries[0].raw==='音楽：静かな曲……'&&$('#editor').lastElementChild.dataset.kind==='music'") and page.locator('#issueCount').inner_text()=='');page.locator('#close').click()
   setup('人「こんにちは\nSE：発話の続き」');check(tag+' quoted SE is dialogue not a cue',page.evaluate('!chapter().soundCues'))
   setup('　　　彼は悲しい。\n「人物名がない」');check(tag+' advice-only issues do not inflate correction badge',page.evaluate("issues().length===2&&correctionCount()===0") and page.locator('#issueCount').inner_text()=='');page.locator('#check').click();check(tag+' zero fixes dialog agrees with badge','修正する項目はありません' in page.locator('#dialogBody').inner_text());page.locator('#close').click()
   setup('未修正');check(tag+' actionable correction badge matches dialog',page.evaluate("correctionCount()===1") and page.locator('#issueCount').inner_text()=='· 1');page.locator('#check').click();check(tag+' actionable fix visible',page.locator('[data-group]').count()==1);page.locator('#close').click()
   setup('　　　本文。');before=data();page.locator('#focus').click();page.wait_for_function('!!document.fullscreenElement');check(tag+' focus opens native browser fullscreen',page.evaluate("document.body.classList.contains('focus')"))
   check(tag+' fullscreen button removed and exit is accessible cross',page.locator('#browserFullscreen').count()==0 and page.locator('#exitFocus').inner_text()=='×' and page.locator('#exitFocus').get_attribute('aria-label')=='集中モードを終了')
   check(tag+' top bottom and editor share paper',page.evaluate("[document.body,document.querySelector('main'),$('#writing'),$('#focusFooter')].every(e=>getComputedStyle(e).backgroundColor===getComputedStyle($('#writing')).backgroundColor)"))
   page.evaluate('state.dark=true;apply()');check(tag+' dark focus bands also share paper',page.evaluate("[document.body,document.querySelector('main'),$('#writing'),$('#focusFooter')].every(e=>getComputedStyle(e).backgroundColor===getComputedStyle($('#writing')).backgroundColor)"));page.evaluate('state.dark=false;apply()')
   title=page.locator('#focusChapter').bounding_box();footer=page.locator('#focusFooter').bounding_box();check(tag+' chapter name centered at bottom without number',page.locator('#focusChapter').inner_text()=='日常' and abs((title['x']+title['width']/2)-(footer['x']+footer['width']/2))<2)
   page.locator('#nextChapter').click();check(tag+' focus chapter moves safely',page.evaluate("active==='two'") and page.locator('#nextChapter').is_disabled());page.keyboard.press('Alt+PageUp');check(tag+' focus shortcut and metadata preserve original',page.evaluate("active==='one'") and data()==before)
   page.screenshot(path=str(OUT/(tag+'-focus.png')));page.locator('#exitFocus').click();page.wait_for_function('!document.fullscreenElement');check(tag+' cross exits fullscreen and focus',not page.evaluate("document.body.classList.contains('focus')"))
   page.evaluate("()=>{document.documentElement.requestFullscreen=async()=>{throw new DOMException('denied','NotAllowedError')}}");page.locator('#focus').click();check(tag+' denied fullscreen falls back to focus',page.evaluate("document.body.classList.contains('focus')&&!document.fullscreenElement"));page.locator('#exitFocus').click()
   page.evaluate("()=>{$('#editor').classList.add('scroll-active');window.barColor=getComputedStyle($('#editor')).scrollbarColor}");check(tag+' scrollbar reduced alpha while active',page.evaluate("barColor.includes('0.18')"))
   check(tag+' no script exceptions',not errors);ctx.close()
  b.close()
finally:s.shutdown();s.server_close()
(OUT/'checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2));print(len(checks),'sound/focus checks passed')
