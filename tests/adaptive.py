"""Responsive viewport and scrollbar acceptance; isolated local browser data."""
import functools,http.server,json,os,pathlib,shutil,threading
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=pathlib.Path(os.environ.get('TEST_OUTPUT_DIR','/tmp/ohanashi-adaptive-tests'));OUT.mkdir(parents=True,exist_ok=True)
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
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium'))
    ctx=browser.new_context(viewport={'width':1280,'height':900},has_touch=True)
    ctx.route('https://fonts.googleapis.com/**',lambda r:r.abort())
    page=ctx.new_page();page.goto('http://127.0.0.1:'+str(server.server_port))
    page.evaluate("""()=>{state=validate({...initial,title:'再配置',font:'Noto Sans JP',size:18,direction:'vertical',chapters:[{id:'test',title:'長い章',text:'○場\\n'+Array(120).fill('人「文章を保持する」').join('\\n')} ]});active=state.chapters[0].id;render();resetHistory();save();const r=document.createRange();r.selectNodeContents($('#editor').children[2]);getSelection().removeAllRanges();getSelection().addRange(r)}""")
    raw=page.evaluate('localStorage.getItem(KEY)');selected=page.evaluate('getSelection().toString()')
    for width,height in [(390,844),(844,390),(600,800),(1000,700),(360,280),(320,640),(1280,900)]:
        page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(100)
        check('viewport preserves document/preferences/selection '+str((width,height)),page.evaluate('localStorage.getItem(KEY)')==raw and page.evaluate('getSelection().toString()')==selected and page.evaluate("state.font==='Noto Sans JP'&&state.size===18&&state.direction==='vertical'"))
        bounds=page.locator('#writing').bounding_box()
        check('editor remains inside viewport '+str((width,height)),bounds['x']>=0 and bounds['y']>=0 and bounds['x']+bounds['width']<=width+1 and bounds['y']+bounds['height']<=height+1 and bounds['height']>=45)
        page.screenshot(path=str(OUT/f'viewport-{width}-{height}.png'))
    page.mouse.move(600,400);page.wait_for_timeout(1400)
    check('scrollbar initially transparent without removing scroll area',page.locator('#editor').evaluate("e=>getComputedStyle(e).scrollbarColor==='rgba(0, 0, 0, 0) rgba(0, 0, 0, 0)'&&getComputedStyle(e).overflowX==='auto'"))
    page.locator('#editor').hover(position={'x':200,'y':100});old=page.locator('#editor').evaluate('e=>e.scrollLeft');page.mouse.wheel(0,350)
    page.wait_for_function("$('#editor').classList.contains('scroll-active')")
    check('vertical writing wheel scrolls and reveals scrollbar',page.locator('#editor').evaluate('e=>e.scrollLeft')!=old)
    page.wait_for_timeout(1400);check('scrollbar auto hides after scrolling',not page.locator('#editor').evaluate("e=>e.classList.contains('scroll-active')"))
    page.locator('#direction').click();page.locator('#editor').hover(position={'x':200,'y':100});page.mouse.wheel(0,250);page.wait_for_function("$('#editor').scrollTop>0")
    check('horizontal writing scrolls normally',page.locator('#editor').evaluate('e=>e.scrollTop')>0)
    page.evaluate("()=>{for(let i=0;i<30;i++)state.chapters.push(ScriptModel.migrateChapter({id:'extra'+i,title:'追加章',text:'本文'}));renderNav();$('#chapterPanel').scrollTop=200}")
    page.locator('#menu').click();page.locator('#chapterPanel').evaluate('e=>e.scrollTop=200')
    page.wait_for_function("$('#chapterPanel').classList.contains('scroll-active')")
    check('chapter list scroll reveals its scrollbar',page.locator('#chapterPanel').evaluate('e=>e.scrollTop')>0)
    page.wait_for_timeout(1400);check('chapter list scrollbar auto hides',not page.locator('#chapterPanel').evaluate("e=>e.classList.contains('scroll-active')"))
    page.locator('#sidebarBackdrop').click(position={'x':10,'y':800});page.locator('#theme').click();page.mouse.move(600,400);page.wait_for_timeout(1400)
    check('dark theme also hides scrollbar',page.locator('#editor').evaluate("e=>getComputedStyle(e).scrollbarColor==='rgba(0, 0, 0, 0) rgba(0, 0, 0, 0)'"))
    page.locator('#editor').hover(position={'x':200,'y':100});page.mouse.wheel(0,100);page.wait_for_timeout(100)
    check('dark scrollbar uses existing theme color',page.locator('#editor').evaluate("e=>getComputedStyle(e).scrollbarColor.includes('rgb(153, 153, 149)')"))
    page.screenshot(path=str(OUT/'dark-theme.png'))
    page.emulate_media(forced_colors='active');check('forced colors keep native scrollbar',page.locator('#editor').evaluate("e=>getComputedStyle(e).scrollbarColor==='auto'"))
    check('viewport zoom remains unrestricted',page.locator('meta[name=viewport]').get_attribute('content')=='width=device-width,initial-scale=1' and page.locator('#editor').evaluate("e=>getComputedStyle(e).touchAction==='auto'"))
    browser.close()
finally:server.shutdown();server.server_close()
(OUT/'checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2))
print(len(checks),'adaptive checks passed')
