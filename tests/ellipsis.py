"""Inspect rendered ink rather than only checking CSS declarations (three fonts)."""
import functools,http.server,pathlib,shutil,threading
from PIL import Image
from playwright.sync_api import sync_playwright
from font_support import fonts
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=pathlib.Path('/tmp/ohanashi-ellipsis-tests');OUT.mkdir(exist_ok=True)
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT/'dist')))
threading.Thread(target=server.serve_forever,daemon=True).start()
def ink(path):
 im=Image.open(path).convert('RGB');bounds=im.convert('L').point(lambda v:255 if v<80 else 0).getbbox()
 assert bounds and bounds[3]-bounds[1]>4*(bounds[2]-bounds[0]),'ellipsis should be vertical'
 assert abs((bounds[0]+bounds[2])/2-im.width/2)<im.width*.2,'ellipsis should be centered'
 return im
checks=0;proof=Image.new('RGB',(360,180),'white')
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=shutil.which('chromium'));ctx=browser.new_context();fonts(ctx);page=ctx.new_page();page.goto('http://127.0.0.1:'+str(server.server_port))
  for i,font in enumerate(['Noto Serif JP','Noto Sans JP','Zen Old Mincho']):
   page.evaluate("font=>{state=validate({...initial,font,size:40,cover:false,chapters:[{id:'one',title:'確認',text:'あ……あ……'}]});active='one';render()}",font)
   page.evaluate('document.fonts.ready');path=OUT/(font.replace(' ','-')+'.png');page.locator('#editor .verticalEllipsis').first.screenshot(path=str(path));proof.paste(ink(path),(i*120,0));checks+=1;print('PASS centered vertical ellipsis ink '+font,flush=True)
   before=page.evaluate('JSON.stringify(state)')
   page.evaluate("async()=>{window.print=()=>{};await printProject(false);$('#printRoot').classList.add('pdf-render');$('#printRoot').style.left='0';$('#printRoot').style.zIndex='10'}")
   page.locator('.printbody .verticalEllipsis').first.screenshot(path=str(path.with_name(path.stem+'-print.png')));ink(path.with_name(path.stem+'-print.png'))
   assert page.evaluate('JSON.stringify(state)')==before;checks+=1;print('PASS print vertical ellipsis and immutable source '+font,flush=True)
   page.evaluate("()=>{$('#printRoot').classList.remove('pdf-render');$('#printRoot').style.left='';$('#printRoot').style.zIndex=''}")
  browser.close()
finally:server.shutdown();server.server_close()
proof.save(OUT/'three-fonts.png');print(checks,'ellipsis checks passed')
