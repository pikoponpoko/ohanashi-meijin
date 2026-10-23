"""Real SW update lifecycle; serves virtual revisions without editing the application."""
import functools, http.server, json, os, pathlib, shutil, threading
from playwright.sync_api import sync_playwright

ROOT=pathlib.Path(__file__).resolve().parent.parent/'dist'
OUT=pathlib.Path(os.environ.get('TEST_OUTPUT_DIR','test-results/pwa-update'));OUT.mkdir(parents=True,exist_ok=True)
revision={'version':1,'fail':False};checks=[]
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
    def do_GET(self):
        if self.path=='/sw.js':
            body=(ROOT/'sw.js').read_bytes().replace(b'ohanashi-shell-v1',('ohanashi-shell-v'+str(revision['version'])).encode())
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
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium'))
        ctx=browser.new_context();ctx.route('https://fonts.googleapis.com/**',lambda route:route.abort())
        page=ctx.new_page();page.goto(base);page.wait_for_function('navigator.serviceWorker.getRegistration().then(r=>r&&r.active?.state==="activated")')
        print('SW registered',page.evaluate('navigator.serviceWorker.getRegistration().then(r=>({scope:r.scope,script:r.active.scriptURL,url:location.href}))'),flush=True)
        page.reload()
        print('Reload state',page.evaluate('navigator.serviceWorker.getRegistration().then(r=>({scope:r?.scope,active:r?.active?.state,controller:!!navigator.serviceWorker.controller,url:location.href}))'),flush=True)
        page.wait_for_function('!!navigator.serviceWorker.controller',timeout=5000)
        page.evaluate("()=>{state=validate({version:1,title:'更新保護',chapters:[{id:'original',title:'元章',text:'人「変更しない」'}]});active=state.chapters[0].id;render();resetHistory();save()}")
        saved=page.evaluate('localStorage.getItem(KEY)')
        page.evaluate("()=>caches.open('unrelated-cache').then(c=>c.put('/private-test',new Response('keep')))")
        revision['version']=2
        page.evaluate('()=>navigator.serviceWorker.getRegistration().then(r=>r.update()).then(()=>{})')
        page.wait_for_function('navigator.serviceWorker.getRegistration().then(r=>!!r.waiting)')
        check('new SW waits while editor remains open',page.evaluate('localStorage.getItem(KEY)')==saved and page.evaluate("caches.keys().then(keys=>keys.includes('ohanashi-shell-v1')&&keys.includes('ohanashi-shell-v2'))"))
        page.evaluate('()=>caretEnd($("#editor").lastElementChild)');page.keyboard.insert_text('追記');edited=page.evaluate('JSON.parse(JSON.stringify(state))');page.evaluate('save()')
        check('editing continues while update waits',edited['chapters'][0]['text'].endswith('追記') and page.evaluate('navigator.serviceWorker.getRegistration().then(r=>!!r.waiting)'))
        page.close()
        next_page=ctx.new_page();next_page.goto(base)
        next_page.wait_for_function("Promise.all([navigator.serviceWorker.getRegistration().then(r=>r.active?.state==='activated'&&!r.waiting),caches.keys().then(keys=>keys.includes('ohanashi-shell-v2')&&!keys.includes('ohanashi-shell-v1'))]).then(xs=>xs.every(Boolean))")
        check('closing editor activates update without losing IDs/body',next_page.evaluate('JSON.parse(JSON.stringify(state))')==edited)
        check('activation retains unrelated caches',next_page.evaluate("caches.has('unrelated-cache')"))
        revision.update(version=3,fail=True)
        next_page.evaluate('''()=>{window.updateFailed=new Promise(resolve=>{navigator.serviceWorker.getRegistration().then(r=>{r.addEventListener('updatefound',()=>{const w=r.installing;w.addEventListener('statechange',()=>{if(w.state==='redundant')resolve(true)})});r.update()})})}''')
        next_page.wait_for_function('window.updateFailed')
        check('failed precache does not replace active shell',next_page.evaluate("navigator.serviceWorker.getRegistration().then(r=>!!r.active&&!r.waiting)") and next_page.evaluate("caches.has('ohanashi-shell-v2')"))
        ctx.set_offline(True);next_page.reload()
        check('previous shell works offline after failed update',next_page.evaluate('JSON.parse(JSON.stringify(state))')==edited)
        browser.close()
finally:server.shutdown();server.server_close()
(OUT/'update-checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf-8')
print(str(len(checks))+' PWA lifecycle checks passed')
