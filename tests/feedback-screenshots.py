"""Before/after screenshots. Private source images stay outside the repository."""
import functools,http.server,json,os,pathlib,shutil,threading
from playwright.sync_api import sync_playwright
from font_support import fonts
ROOT=pathlib.Path(__file__).resolve().parents[1];PRIVATE=pathlib.Path(os.environ.get('PRIVATE_OUTPUT','/workspace/ohanashi-feedback-artifacts'));PUBLIC=ROOT/'docs/screenshots/post-release'
PUBLIC.mkdir(parents=True,exist_ok=True);PRIVATE.mkdir(parents=True,exist_ok=True)
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
servers=[]
def serve(path):
 s=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(path)));threading.Thread(target=s.serve_forever,daemon=True).start();servers.append(s);return 'http://127.0.0.1:'+str(s.server_port)
before=serve(os.environ.get('BEFORE_FEEDBACK_DIST','/tmp/ohanashi-before-feedback/dist'));after=serve(ROOT/'dist')
source=json.loads(pathlib.Path(os.environ['SOURCE_PROJECT']).read_text()) if os.environ.get('SOURCE_PROJECT') else None
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=shutil.which('chromium'))
  for label,base in [('before',before),('after',after)]:
   for name,width,height in [('desktop',1280,900),('phone',390,844)]:
    for private in ([False,True] if source else [False]):
     ctx=browser.new_context(viewport={'width':width,'height':height},has_touch=name=='phone');fonts(ctx);page=ctx.new_page();page.goto(base)
     if private:page.evaluate("v=>{state=validate(v);active=state.chapters[0].id;render();resetHistory();save()}",source)
     else:page.evaluate("()=>{state=validate({...initial,title:'動作確認',font:'Zen Old Mincho',size:18,chapters:[{id:'one',title:'第一章',text:'○駅（朝）\\n　　　扉が開く。\\n人「こんにちは」\\n#C2\\n　　　歩き出す。'},{id:'two',title:'第二章',text:'○街\\n人「待っていて」'}]});active='one';render();resetHistory();save()}")
     page.evaluate("()=>document.fonts.load('18px \"Zen Old Mincho\"',state.chapters[0].text)");page.evaluate('document.fonts.ready');page.wait_for_timeout(100)
     folder=PRIVATE if private else PUBLIC;prefix=('原本-' if private else '')+name+'-'+label
     page.screenshot(path=str(folder/(prefix+'.png')));page.locator('#focus').click();page.wait_for_timeout(100);page.screenshot(path=str(folder/(prefix+'-focus.png')));page.locator('#exitFocus').click()
     if name=='phone':
      page.evaluate("()=>{Object.defineProperty(visualViewport,'height',{configurable:true,value:300});visualViewport.dispatchEvent(new Event('resize'))}");page.wait_for_timeout(100);page.screenshot(path=str(folder/(prefix+'-keyboard-simulation.png')),clip={'x':0,'y':0,'width':390,'height':300})
     ctx.close()
  browser.close()
finally:
 for s in servers:s.shutdown();s.server_close()
print('Saved comparison images; keyboard images are visible-viewport simulations, not physical device captures')
