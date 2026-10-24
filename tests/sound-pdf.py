"""Real selected-font PDF for the shared synthetic sound fixture."""
import functools,http.server,json,pathlib,shutil,threading
import fitz
from playwright.sync_api import sync_playwright
from font_support import fonts
ROOT=pathlib.Path(__file__).resolve().parents[1];OUT=pathlib.Path('/tmp/ohanashi-sound-tests');OUT.mkdir(exist_ok=True)
class H(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*a):pass
s=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(H,directory=str(ROOT/'dist')));threading.Thread(target=s.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  b=p.chromium.launch(executable_path=shutil.which('chromium'));ctx=b.new_context(accept_downloads=True);fonts(ctx);page=ctx.new_page();page.goto('http://127.0.0.1:'+str(s.server_port))
  page.evaluate("v=>{state=validate({...v,cover:false});active=state.chapters[0].id;render();save()}",json.loads((ROOT/'docs/interop/samples/sound-v2.json').read_text()));before=page.evaluate('JSON.stringify(state)')
  with page.expect_download(timeout=180000) as d:page.evaluate('()=>printProject(true)')
  d.value.save_as(OUT/'sound-print.pdf');doc=fitz.open(OUT/'sound-print.pdf');assert len(doc)>=1;doc[0].get_pixmap().save(str(OUT/'sound-print.png'));doc.close();print('PASS real selected-font sound PDF downloaded',flush=True)
  assert page.locator('.printbody .music').count()==1 and page.locator('.printbody .se').count()==1;print('PASS sound types retained in paginated print',flush=True)
  assert page.locator('.printbody .music').evaluate("e=>getComputedStyle(e).color==='rgb(17, 17, 17)'");print('PASS PDF sound text keeps body ink color',flush=True)
  assert page.evaluate('JSON.stringify(state)')==before;print('PASS PDF leaves text IDs and sound metadata unchanged',flush=True);b.close()
finally:s.shutdown();s.server_close()
print('4 sound PDF checks passed')
