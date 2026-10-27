"""Cut labels use the top of the vertical column in both print and direct PDF."""
import functools,http.server,json,pathlib,shutil,threading
import fitz
from playwright.sync_api import sync_playwright
from font_support import fonts
ROOT=pathlib.Path(__file__).resolve().parents[1];OUT=pathlib.Path('/tmp/ohanashi-print-cut-tests');OUT.mkdir(exist_ok=True)
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT/'dist')));threading.Thread(target=server.serve_forever,daemon=True).start();checks=[]
def check(name,ok=True):
 assert ok,name
 checks.append(name);print('PASS',name,flush=True)
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=shutil.which('chromium'));ctx=browser.new_context(accept_downloads=True);fonts(ctx);page=ctx.new_page();page.goto('http://127.0.0.1:'+str(server.server_port))
  for font in ['Noto Serif JP','Noto Sans JP','Zen Old Mincho']:
   page.evaluate("font=>{state=validate({...initial,font,title:'番号位置の確認',cover:false,chapters:[{id:'one',title:'章',text:'　　　ト書きの本文。\\n#C2\\n人「台詞」'}]});active='one';render();resetHistory();save();window.print=()=>{}}",font);before=page.evaluate('JSON.stringify(state)')
   page.evaluate('()=>printProject(false)');page.evaluate("$('#printRoot').classList.add('pdf-render')")
   check('cut label has dedicated type and zero indent '+font,page.locator('.printbody [data-cut-id]').evaluate_all("es=>es.length===2&&es.every(e=>e.className==='cut'&&getComputedStyle(e).textIndent==='0px'&&getComputedStyle(e).paddingInlineStart==='0px')"))
   check('cut label prints light gray '+font,page.locator('.printbody [data-cut-id]').first.evaluate("e=>getComputedStyle(e).color==='rgb(187, 187, 187)'"))
   check('body action indentation retained '+font,page.locator('.printbody .action').evaluate("e=>parseFloat(getComputedStyle(e).paddingInlineStart)>0"))
   check('cut glyph begins above action glyph '+font,page.evaluate("()=>{const first=s=>{const r=document.createRange();r.selectNodeContents($(s));return r.getBoundingClientRect().top};return first('.printbody [data-cut-id]')<first('.printbody .action')-20}"))
   page.emulate_media(media='print');check('browser print retains zero cut indent '+font,page.locator('.printbody [data-cut-id]').first.evaluate("e=>getComputedStyle(e).textIndent==='0px'"));page.emulate_media(media='screen');page.evaluate("$('#printRoot').classList.remove('pdf-render')")
   with page.expect_download(timeout=180000) as d:page.evaluate('()=>printProject(true)')
   file=OUT/(font.replace(' ','-')+'.pdf');d.value.save_as(file);doc=fitz.open(file);doc[0].get_pixmap().save(str(file.with_suffix('.png')));doc.close()
   check('direct PDF retains structural label type '+font,page.locator('.printbody [data-cut-id]').evaluate_all("es=>es.every(e=>e.className==='cut'&&e.style.textIndent==='0px')"))
   check('print and PDF do not mutate manuscript '+font,page.evaluate('JSON.stringify(state)')==before)
  browser.close()
finally:server.shutdown();server.server_close()
(OUT/'checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2));print(len(checks),'print cut alignment checks passed')
