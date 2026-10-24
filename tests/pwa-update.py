"""Real SW update lifecycle; serves virtual revisions without editing the application."""
import re, functools, http.server, json, os, pathlib, shutil, threading, time
from playwright.sync_api import sync_playwright

ROOT=pathlib.Path(__file__).resolve().parent.parent/'dist'
OUT=pathlib.Path(os.environ.get('TEST_OUTPUT_DIR','test-results/pwa-update'));OUT.mkdir(parents=True,exist_ok=True)
revision={'version':1,'fail':False};checks=[]
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
    def do_GET(self):
        if self.path=='/sw.js':
            body=re.sub(rb"const CACHE='[^']+'",("const CACHE='ohanashi-shell-v"+str(revision['version'])+"'").encode(),(ROOT/'sw.js').read_bytes(),count=1)
            self.send_response(200);self.send_header('Content-Type','text/javascript');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(body)
        elif self.path=='/manifest.webmanifest' and revision['fail']:
            self.send_error(503)
        else:super().do_GET()
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
base='http://127.0.0.1:'+str(server.server_port)
def check(name,ok=True):
    assert ok,name
    checks.append(name);print('PASS',name,flush=True)
def wait_registration(page):
    # Playwright evaluate awaits Promises; wait_for_function must inspect a value.
    # A bare Promise in wait_for_function can be accepted before it resolves.
    page.evaluate("""async()=>{
      let timer;
      try { window.registration=await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('SW ready timeout')),10000)})
      ]); } finally { clearTimeout(timer); }
    }""")
    page.wait_for_function('window.registration.active?.state === "activated"',timeout=10000)

def wait_caches(page, present, absent=()):
    deadline=time.monotonic()+10
    while time.monotonic()<deadline:
        keys=page.evaluate('caches.keys()')
        if all(key in keys for key in present) and all(key not in keys for key in absent):
            return
        page.wait_for_timeout(50)
    raise AssertionError('Cache transition timeout: '+repr(keys))

def data(page):return page.evaluate('JSON.parse(JSON.stringify(state))')

try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium'))
        ctx=browser.new_context();ctx.route('https://fonts.googleapis.com/**',lambda route:route.abort())
        page=ctx.new_page();page.goto(base);wait_registration(page)
        page.reload();wait_registration(page)
        page.wait_for_function('!!navigator.serviceWorker.controller',timeout=10000)
        page.evaluate("""()=>{
          state=validate({version:1,title:'更新保護',chapters:[
            {id:'original',title:'元章',text:'○駅\\n人「変更しない」\\n#C2\\n　　　動作。'},
            {id:'second',title:'次章',text:'人「次の章も保持」'}
          ]});active=state.chapters[0].id;render();resetHistory();save();
        }""")
        # Simulate lifecycle delivery before the 350ms autosave timer can run.
        for event in ['pagehide','visibilitychange']:
            page.evaluate("""event=>{
              chapter().text+='退避';changed();clearTimeout(timer);
              if(event==='visibilitychange')Object.defineProperty(document,'hidden',{configurable:true,value:true});
              (event==='pagehide'?window:document).dispatchEvent(new Event(event));
              if(event==='visibilitychange')delete document.hidden;
            }""",event)
            check('dirty manuscript saved on '+event,json.loads(page.evaluate('localStorage.getItem(KEY)'))==data(page) and not page.evaluate('dirty'))
        saved=page.evaluate('localStorage.getItem(KEY)')
        # Archive bytes and an unrelated localStorage key must also survive.
        page.evaluate("""()=>{
          localStorage.setItem(ARCHIVE_PREFIX+'fixture',JSON.stringify({title:'退避原稿',savedAt:new Date().toISOString(),raw:localStorage.getItem(KEY)}));
          localStorage.setItem('unrelated-data','keep');
        }""")
        archive=page.evaluate("localStorage.getItem(ARCHIVE_PREFIX+'fixture')")
        page.evaluate("()=>caches.open('unrelated-cache').then(c=>c.put('/private-test',new Response('keep')))")
        peer=ctx.new_page();peer.goto(base);wait_registration(peer)
        peer.wait_for_function('!!navigator.serviceWorker.controller',timeout=10000)
        revision['version']=2
        page.evaluate('()=>window.registration.update()')
        page.wait_for_function('window.registration.waiting?.state === "installed"',timeout=10000)
        check('new SW waits while editor remains open',page.evaluate('localStorage.getItem(KEY)')==saved and page.evaluate('window.registration.active !== window.registration.waiting'))
        wait_caches(page,['ohanashi-shell-v1','ohanashi-shell-v2'])
        page.evaluate('()=>caretEnd($("#editor").lastElementChild)');page.keyboard.insert_text('追記');page.evaluate('save()');edited=data(page)
        edited_raw=page.evaluate('localStorage.getItem(KEY)')
        check('editing continues while update waits',edited['chapters'][0]['text'].endswith('追記') and page.evaluate('window.registration.waiting?.state === "installed"'))
        check('editing preserves original chapter and cut IDs',
              [[c['id'],c['cuts']] for c in json.loads(saved)['chapters']]==[[c['id'],c['cuts']] for c in edited['chapters']])
        peer.evaluate("""()=>{
          Object.defineProperty(document,'hidden',{configurable:true,value:true});
          document.dispatchEvent(new Event('visibilitychange'));delete document.hidden;
        }""")
        check('clean stale hidden window does not overwrite saved edits',peer.evaluate('localStorage.getItem(KEY)')==edited_raw)
        page.close()
        peer.wait_for_function('window.registration.waiting?.state === "installed"',timeout=10000)
        check('update still waits while another app window remains',peer.evaluate('window.registration.active.state === "activated" && !!navigator.serviceWorker.controller'))
        peer.close()
        next_page=ctx.new_page();next_page.goto(base);wait_registration(next_page)
        next_page.wait_for_function('!window.registration.waiting && !!navigator.serviceWorker.controller',timeout=10000)
        wait_caches(next_page,['ohanashi-shell-v2'],['ohanashi-shell-v1'])
        check('closing all editors activates update without losing IDs/body',data(next_page)==edited and next_page.evaluate('localStorage.getItem(KEY)')==edited_raw)
        check('activation retains archived manuscripts and unrelated storage',next_page.evaluate("localStorage.getItem(ARCHIVE_PREFIX+'fixture')")==archive and next_page.evaluate("localStorage.getItem('unrelated-data')")=='keep')
        check('activation retains unrelated cache contents',next_page.evaluate("caches.open('unrelated-cache').then(c=>c.match('/private-test')).then(r=>r.text())")=='keep')
        # Confirm a second reload and offline edit really run under the new shell.
        ctx.set_offline(True);next_page.reload()
        check('updated shell opens offline with exact manuscript and IDs',data(next_page)==edited)
        next_page.evaluate('()=>caretEnd($("#editor").lastElementChild)');next_page.keyboard.insert_text('オフライン追記');next_page.evaluate('save()')
        edited=data(next_page);edited_raw=next_page.evaluate('localStorage.getItem(KEY)')
        next_page.reload()
        check('offline edits survive reload under updated shell',data(next_page)==edited)
        ctx.set_offline(False);wait_registration(next_page)
        revision.update(version=3,fail=True)
        # Await the failure event with a deadline; a Promise object is not a result.
        same_worker=next_page.evaluate("""()=>new Promise((resolve,reject)=>{
          const r=window.registration,previous=r.active;
          const timer=setTimeout(()=>{cleanup();reject(Error('Update failure timeout'))},10000);
          const cleanup=()=>{clearTimeout(timer);r.removeEventListener('updatefound',found)};
          const found=()=>{
            const worker=r.installing;
            const changed=()=>{
              if(worker.state==='redundant'){
                worker.removeEventListener('statechange',changed);cleanup();
                resolve(r.active===previous);
              }
            };
            worker.addEventListener('statechange',changed);changed();
          };
          r.addEventListener('updatefound',found);
          r.update().catch(error=>{cleanup();reject(error)});
        })""")
        check('failed precache does not replace active shell',same_worker and next_page.evaluate('window.registration.active.state === "activated" && !window.registration.waiting') and next_page.evaluate("caches.has('ohanashi-shell-v2')"))
        ctx.set_offline(True);next_page.reload()
        check('previous shell works offline after failed update',data(next_page)==edited and next_page.evaluate('localStorage.getItem(KEY)')==edited_raw)
        check('failed update retains archive and unrelated data',next_page.evaluate("localStorage.getItem(ARCHIVE_PREFIX+'fixture')")==archive and next_page.evaluate("localStorage.getItem('unrelated-data')")=='keep' and next_page.evaluate("caches.open('unrelated-cache').then(c=>c.match('/private-test')).then(r=>r.text())")=='keep')
        browser.close()
finally:server.shutdown();server.server_close()
(OUT/'update-checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf-8')
print(str(len(checks))+' PWA lifecycle checks passed')
