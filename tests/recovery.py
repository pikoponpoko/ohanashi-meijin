"""Reproduce Chrome ERR_FAILED in a legacy SW, then recover without clearing data."""
import functools,http.server,json,os,pathlib,shutil,threading
from playwright.sync_api import sync_playwright,Error
ROOT=pathlib.Path(__file__).resolve().parents[1];OUT=pathlib.Path('/tmp/ohanashi-recovery-tests');OUT.mkdir(exist_ok=True)
legacy=pathlib.Path('/tmp/ohanashi-before-feedback/dist/sw.js').read_text();mode={'legacy':True}
hook="""\nself.addEventListener('message',e=>{if(e.data==='BREAK_CACHE'){caches.open=()=>Promise.reject(Error('simulated CacheStorage failure'));e.ports[0].postMessage('ready')}});"""
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  if self.path=='/sw.js':
   code=legacy+hook if mode['legacy'] else (ROOT/'dist/sw.js').read_text();self.send_response(200);self.send_header('Content-Type','text/javascript');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(code.encode())
  else:super().do_GET()
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT/'dist')));threading.Thread(target=server.serve_forever,daemon=True).start();base='http://127.0.0.1:'+str(server.server_port);checks=[]
def check(name,ok=True):
 assert ok,name
 checks.append(name);print('PASS',name,flush=True)
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=shutil.which('chromium'));ctx=browser.new_context(accept_downloads=True);ctx.route('https://fonts.googleapis.com/**',lambda r:r.abort());page=ctx.new_page();page.goto(base)
  page.evaluate("()=>{state=validate({...initial,title:'保持する原稿',chapters:[{id:'safe',title:'第一章',text:'○場所\\n人「原稿を保持する」'}]});active='safe';render();resetHistory();save();localStorage.setItem(KEY+'-document-safe',JSON.stringify({raw:localStorage.getItem(KEY),title:'退避原稿',savedAt:new Date().toISOString()}));localStorage.setItem('unrelated','keep')}")
  raw=page.evaluate('localStorage.getItem(KEY)');page.evaluate('async()=>{window.reg=await navigator.serviceWorker.ready}');page.reload();page.wait_for_function('!!navigator.serviceWorker.controller')
  page.evaluate("async()=>{await new Promise(resolve=>{const c=new MessageChannel();c.port1.onmessage=resolve;navigator.serviceWorker.controller.postMessage('BREAK_CACHE',[c.port2])})}")
  failed=False
  try:page.reload(timeout=10000)
  except Error as e:failed='ERR_FAILED' in str(e)
  check('legacy cache exception reproduces Chrome ERR_FAILED',failed)
  failed_page=page;page=ctx.new_page();page.goto(base+'/recovery.html');failed_page.close();check('recovery page bypasses broken legacy navigation cache',page.locator('#saveRecovery').is_enabled() and page.evaluate('localStorage.getItem("scenario-meijin-v1")')==raw)
  check('repair waits for explicit save confirmation',page.locator('#repairConnection').is_disabled())
  with page.expect_download() as d:page.locator('#saveRecovery').click()
  check('recovery exports exact original raw JSON',pathlib.Path(d.value.path()).read_text()==raw)
  mode['legacy']=False;page.locator('#repairConnection').click();page.wait_for_url(base+'/?recovered=1');page.wait_for_selector('#editor')
  check('repair restores editor without altering manuscript or IDs',page.evaluate('localStorage.getItem(KEY)')==raw)
  check('repair preserves archives and unrelated storage',page.evaluate("localStorage.getItem('unrelated')==='keep'&&!!localStorage.getItem(KEY+'-document-safe')"))
  # A concurrently saved manuscript must not be overwritten or repaired using a stale backup.
  page.goto(base+'/recovery.html');page.locator('#saveRecovery').click();page.evaluate("localStorage.setItem('scenario-meijin-v1',localStorage.getItem('scenario-meijin-v1')+' ')");new=page.evaluate("localStorage.getItem('scenario-meijin-v1')");page.locator('#repairConnection').click()
  check('concurrent update prevents stale repair',page.url.endswith('/recovery.html') and page.evaluate("localStorage.getItem('scenario-meijin-v1')")==new and '更新' in page.locator('#status').inner_text())
  page.screenshot(path=str(OUT/'recovery.png'));browser.close()
finally:server.shutdown();server.server_close()
(OUT/'checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2));print(len(checks),'recovery checks passed; actual user-profile cause remains unconfirmed')
