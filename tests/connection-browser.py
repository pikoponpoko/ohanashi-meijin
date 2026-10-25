"""Isolated Chromium profiles. Never opens or changes a user's browser profile."""
import functools, http.server, json, pathlib, shutil, threading, tempfile, time
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/connection';OUT.mkdir(parents=True,exist_ok=True)
legacy=False
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
 def do_GET(self):
  name=self.path.split('?')[0]
  if legacy and name in ['/sw.js','/pwa.js']:
   content=(ROOT/'tests/fixtures'/('legacy-'+name[1:])).read_bytes()
   self.send_response(200);self.send_header('Content-Type','text/javascript');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(content)
  else:super().do_GET()
 def end_headers(self):
  self.send_header('Cache-Control','no-store');super().end_headers()
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT/'dist')))
threading.Thread(target=server.serve_forever,daemon=True).start()
BASE=f'http://127.0.0.1:{server.server_port}'
checks=[];events=[]
def check(name,condition=True):
 assert condition,name
 checks.append(name);print('PASS',name,flush=True)
def launch(p,profile):
 ctx=p.chromium.launch_persistent_context(str(profile),executable_path=shutil.which('chromium'),headless=True,args=['--no-sandbox'])
 ctx.route('https://fonts.googleapis.com/**',lambda r:r.abort())
 page=ctx.pages[0]
 page.on('pageerror',lambda e:events.append({'type':'app-error','error':str(e)}))
 page.on('requestfailed',lambda r:events.append({'type':'network-error','url':r.url,'error':r.failure}))
 page.on('response',lambda r:events.append({'type':'http-error','url':r.url,'status':r.status}) if r.status>=400 else None)
 return ctx,page
def wait_true(page,expression):
 deadline=time.monotonic()+15
 while time.monotonic()<deadline:
  if page.evaluate(expression):return
  page.wait_for_timeout(50)
 raise AssertionError('Timed out: '+expression)
def storage(page):return page.evaluate('JSON.stringify({...localStorage})')
with sync_playwright() as p, tempfile.TemporaryDirectory(prefix='ohanashi-profiles-') as directory:
 profile=pathlib.Path(directory)/'existing'
 legacy=True
 ctx,page=launch(p,profile);page.goto(BASE);page.evaluate('navigator.serviceWorker.ready.then(()=>true)');page.reload();page.wait_for_function('navigator.serviceWorker.controller!==null')
 page.evaluate("""()=>{state.title='接続保持試験';state.dark=true;chapter().text='原稿は消さない';render();save();localStorage.setItem('scenario-meijin-connection-test-archive','退避データ');localStorage.setItem('unrelated-setting','保持')}""")
 page.evaluate("""async()=>{await caches.open('other-app-v1');await caches.open('ohanashi-shell-custom')}""")
 saved=storage(page)
 check('legacy profile controlled by real v11 worker',page.evaluate("caches.has('ohanashi-shell-v11')"))
 legacy=False
 page.reload()
 check('old cache still serves auto-registering pwa.js after server fix',page.evaluate("caches.open('ohanashi-shell-v11').then(c=>c.match(location.origin+'/pwa.js')).then(r=>r.text()).then(t=>t.includes('serviceWorker.register'))"))
 # Keep an unsaved draft in memory; retirement must not reload any client.
 page.evaluate("window.unsavedWitness='入力中';window.retiringRegistration=null")
 page.evaluate("""async()=>{window.retiringRegistration=await navigator.serviceWorker.getRegistration();await window.retiringRegistration.update()}""")
 wait_true(page,"navigator.serviceWorker.getRegistrations().then(r=>r.length===0)")
 wait_true(page,"caches.has('ohanashi-shell-v11').then(exists=>!exists)")
 check('retirement activates over old worker and unregisters without reload',page.evaluate("window.unsavedWitness==='入力中'"))
 check('retirement preserves all localStorage bytes',storage(page)==saved)
 check('other caches retained',page.evaluate("Promise.all(['other-app-v1','ohanashi-shell-custom'].map(k=>caches.has(k))).then(a=>a.every(Boolean))"))
 ctx.close()
 for i in range(12):
  ctx,page=launch(p,profile);response=page.goto(BASE);page.wait_for_selector('#editor')
  wait_true(page,'navigator.serviceWorker.getRegistrations().then(r=>r.length===0)')
  check(f'existing profile full Chromium restart {i+1}: HTTP 200, no controller, data intact',response.status==200 and page.evaluate('navigator.serviceWorker.controller===null') and storage(page)==saved)
  ctx.close()
 # Independent repair page with a legacy worker. It must work without the app shell.
 legacy=True
 ctx,page=launch(p,pathlib.Path(directory)/'repair');page.goto(BASE);page.evaluate('navigator.serviceWorker.ready.then(()=>true)');page.reload()
 page.evaluate("localStorage.setItem('scenario-meijin-v1','{broken');localStorage.setItem('backup-witness','元データ')")
 raw=storage(page);legacy=False;page.goto(BASE+'/recovery.html')
 check('repair requires backup before repair',page.locator('#repairConnection').is_disabled())
 with page.expect_download() as download:page.locator('#saveRecovery').click()
 check('recovery downloads original corrupt bytes',pathlib.Path(download.value.path()).read_bytes()==b'{broken')
 page.locator('#repairConnection').click();page.wait_for_url(BASE+'/?recovered=1')
 check('repair navigates without re-registration and preserves storage',storage(page)==raw and page.evaluate('navigator.serviceWorker.getRegistrations().then(r=>r.length===0)'))
 ctx.close()
 # New profile. OS-installed PWA testing needs a separate device.
 ctx,page=launch(p,pathlib.Path(directory)/'fresh');page.goto(BASE)
 check('new profile has no worker',page.evaluate('navigator.serviceWorker.getRegistrations().then(r=>r.length===0)'))
 page.screenshot(path=str(OUT/'desktop.png'))
 ctx.set_offline(True)
 try:page.reload(timeout=10000);offline_failed=False
 except Exception as e:offline_failed=True;events.append({'type':'network-error','test':'intentional-offline-navigation','error':str(e)})
 check('offline navigation explicitly fails at network, not inside editor',offline_failed)
 ctx.close()
 check('no application runtime errors',not any(e['type']=='app-error' for e in events))
server.shutdown()
(OUT/'results.json').write_text(json.dumps({'browser':'headless system Chromium on Linux','checks':checks,'events':events},ensure_ascii=False,indent=2))
print(f'{len(checks)} connection browser checks passed')
