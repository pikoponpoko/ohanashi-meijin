"""Compact-shell, timing UI, keyboard/touch and before/after layout checks with recordings."""
import functools,http.server,json,os,pathlib,shutil,threading
from playwright.sync_api import sync_playwright
from font_support import fonts
ROOT=pathlib.Path(__file__).resolve().parents[1];OUT=pathlib.Path(os.environ.get('TEST_OUTPUT_DIR','/tmp/ohanashi-layout-tests'));OUT.mkdir(parents=True,exist_ok=True)
BEFORE=pathlib.Path(os.environ.get('BEFORE_LAYOUT_DIST','/tmp/ohanashi-before-layout/dist'))
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
servers=[]
def serve(path):
 s=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(path)));threading.Thread(target=s.serve_forever,daemon=True).start();servers.append(s);return 'http://127.0.0.1:'+str(s.server_port)
base=serve(ROOT/'dist');before_base=serve(BEFORE) if BEFORE.exists() else None
checks=[]
def pause(page):
 if page.video:page.wait_for_timeout(900)
def check(name,ok=True):
 assert ok,name
 checks.append(name);print('PASS',name,flush=True)
def seed(page):
 page.evaluate("""()=>{state=validate({...initial,title:'操作確認',chapters:[{id:'one',title:'第一章　駅で',status:'完了',text:'○駅（朝）\\n　　　扉が開く。\\n澪「12時には戻るよ！」\\n#C2\\n　　　人が振り返る。'},{id:'two',title:'第二章　街へ',status:'見直し',text:'○街\\n声「待っていて？」'},{id:'three',title:'第三章　帰り道',status:'未着手',text:'　　　歩き続ける。'}]});active='one';render();resetHistory();save()}""")
def styles(page):return page.locator('#editor').evaluate("e=>{const s=getComputedStyle(e);return Object.fromEntries(['fontSize','fontFamily','lineHeight','letterSpacing','paddingTop','paddingRight','paddingBottom','paddingLeft','writingMode'].map(k=>[k,s[k]]))}")
def data(page):return page.evaluate('JSON.parse(JSON.stringify(state))')
# Use system FFmpeg only for Playwright's local recording dependency.
ffmpeg=shutil.which('ffmpeg');runtime=OUT/'recording-runtime';binary=runtime/'ffmpeg-1011/ffmpeg-linux';binary.parent.mkdir(parents=True,exist_ok=True)
if ffmpeg and not binary.exists():binary.symlink_to(ffmpeg)
os.environ['PLAYWRIGHT_BROWSERS_PATH']=str(runtime)
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium'))
  for name,width,height in [('desktop',1365,900),('phone',390,844),('landscape',844,390),('keyboard',390,300)]:
   opts=dict(viewport={'width':width,'height':height},has_touch=name!='desktop')
   if ffmpeg and name in ['desktop','phone']:opts.update(record_video_dir=str(OUT/'raw-video'),record_video_size={'width':width,'height':height})
   ctx=browser.new_context(**opts);fonts(ctx);page=ctx.new_page();page.goto(base);seed(page);page.evaluate("document.fonts.ready");raw=data(page);pause(page)
   if before_base:
    old=browser.new_page(viewport={'width':width,'height':height});fonts(old);old.goto(before_base);seed(old);old.evaluate("document.fonts.ready")
    for direction in ['vertical','horizontal']:
     for target in [old,page]:target.evaluate("direction=>{state.direction=direction;apply()}",direction)
     check('body typography unchanged '+name+' '+direction,styles(page)==styles(old))
    for target in [old,page]:target.evaluate("()=>{state.direction='vertical';apply()}")
    a=old.locator('#writing').bounding_box();b=page.locator('#writing').bounding_box()
    check('normal writing area grows '+name,b['width']>=a['width'] and b['height']>a['height'])
    old.screenshot(path=str(OUT/(name+'-before.png')));old.close()
   check('desktop sidebar and onscreen Undo Redo are removed '+name,page.locator('aside,#sidebar,#undo,#redo').count()==0)
   check('header stays one compact row '+name,page.locator('header').bounding_box()['height']<=48)
   for selector in ['[data-insert=scene]','[data-insert=action]','[data-fix=blank]','#focus','#direction','#settings']:
    box=page.locator(selector).bounding_box();check('main control directly visible '+name+' '+selector,page.locator(selector).is_visible() and box['x']>=0 and box['x']+box['width']<=width+1)
   check('overall progress remains visible '+name,page.locator('#overallProgress').is_visible() and page.locator('#percent').inner_text()=='33%' and page.locator('#progressText').inner_text()=='1 / 3 章')
   page.locator('#menu').click();pause(page);check('chapter picker preserves moon marks '+name,page.locator('#chapters .dot').all_text_contents()==['●','◐','○'] and page.locator('#currentChapterMark').inner_text()=='●')
   page.locator('#status').select_option('見直し');pause(page);check('progress uses existing status calculation '+name,page.locator('#percent').inner_text()=='0%' and page.locator('#currentChapterMark').inner_text()=='◐')
   page.locator('#closeChapters').click();page.locator('#editor').press('Control+z');check('status change remains undoable by keyboard '+name,data(page)==raw)
   page.locator('#menu').click()
   if name!='desktop':page.touchscreen.tap(width-2,height-2)
   else:page.mouse.click(5,height-30)
   check('chapter backdrop does not click through to footer '+name,data(page)==raw and page.locator('#chapterPanel').is_hidden())
   page.screenshot(path=str(OUT/(name+'-after.png')))
   page.locator('#duration').click();pause(page);check('timing basis is accessible '+name,'台詞' in page.locator('#dialogBody').inner_text() and '動作' in page.locator('#dialogBody').inner_text());page.locator('#close').click()
   page.locator('#settings').click();pause(page);page.locator('#speechPauseField').fill('0');page.locator('#cutPauseField').fill('1.2');page.locator('#timingModeField').select_option('sequential');page.locator('#saveSettings').click();pause(page)
   check('timing settings save without changing text or cut IDs '+name,page.evaluate("state.speechPause===0&&state.cutPause===1.2&&state.timingMode==='sequential'") and [(c['text'],c['cuts']) for c in data(page)['chapters']]==[(c['text'],c['cuts']) for c in raw['chapters']])
   page.locator('#editor').press('Control+z');check('timing settings apply is one Undo '+name,data(page)==raw)
   page.locator('#focus').click();page.wait_for_timeout(150);pause(page)
   previous=page.locator('#previousChapter').bounding_box();next_=page.locator('#nextChapter').bounding_box()
   check('focus previous is bottom right and next bottom left '+name,previous['x']>width/2 and next_['x']<width/3 and previous['y']>height*.7 and next_['y']>height*.7)
   check('first chapter previous button disabled '+name,page.locator('#previousChapter').is_disabled())
   if name=='phone':
    page.evaluate("()=>{caretEnd($('#editor').lastElementChild);window.keyboardRange=getSelection().getRangeAt(0).cloneRange();Object.defineProperty(visualViewport,'height',{configurable:true,value:300});visualViewport.dispatchEvent(new Event('resize'))}");page.wait_for_timeout(100)
    box=page.locator('#writing').bounding_box()
    check('focus follows visual keyboard viewport without rebuilding caret',box['height']>45 and box['y']+box['height']<=301 and page.evaluate("getSelection().anchorNode===keyboardRange.startContainer&&getSelection().anchorOffset===keyboardRange.startOffset"))
    page.evaluate("()=>{delete visualViewport.height;visualViewport.dispatchEvent(new Event('resize'))}");page.wait_for_timeout(100)
   frame=page.locator('#writing').bounding_box();page.evaluate("()=>caretEnd($('#editor').lastElementChild)");page.keyboard.insert_text('追記');page.wait_for_timeout(400);pause(page)
   check('focus placement stays stable while typing '+name,abs(page.locator('#writing').bounding_box()['y']-frame['y'])<1 and page.evaluate("chapter().text.endsWith('追記')"))
   page.locator('#editor').press('Control+z');page.locator('#editor').press('Control+Shift+z');check('keyboard history works without buttons '+name,page.evaluate("chapter().text.endsWith('追記')"))
   if name=='phone':
    latest=data(page);cdp=ctx.new_cdp_session(page);box=page.locator('#editor').bounding_box();x=box['x']+50;y=box['y']+90
    for fingers in [2,3]:
     cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x+i*25,'y':y,'id':i} for i in range(fingers)]});cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
     check('touch history remains active '+str(fingers),data(page)!=latest if fingers==2 else data(page)==latest)
   page.locator('#nextChapter').click();pause(page);page.locator('#nextChapter').click();pause(page);check('last chapter next button disabled '+name,page.locator('#nextChapter').is_disabled() and page.evaluate("active==='three'"))
   page.keyboard.press('Alt+PageUp');pause(page);check('focus keyboard chapter navigation remains available '+name,page.evaluate("active==='two'"))
   page.screenshot(path=str(OUT/(name+'-focus.png')));page.locator('#exitFocus').click();check('onscreen focus exit remains available '+name,not page.evaluate("document.body.classList.contains('focus')"))
   page.locator('#menu').click();page.locator('#chapters .chapterSelect').first.click();check('normal chapter selection preserves manuscript edits '+name,page.evaluate("active==='one'&&chapter().text.endsWith('追記')"))
   page.locator('#export').click();page.wait_for_timeout(300);pause(page);check('export remains directly accessible '+name,page.locator('#outTxt').is_visible());page.locator('#close').click()
   video=page.video;ctx.close()
   if video:shutil.copyfile(video.path(),OUT/(name+'-operations.webm'))
  browser.close()
finally:
 for s in servers:s.shutdown();s.server_close()
(OUT/'checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2))
print(len(checks),'layout checks passed; recordings are browser simulations, not physical devices')
