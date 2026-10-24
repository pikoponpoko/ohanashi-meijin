"""Opt-in private project acceptance. Pass SOURCE_PROJECT; never copies the source into the repo."""
import functools,http.server,json,os,pathlib,shutil,threading
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
SOURCE=pathlib.Path(os.environ['SOURCE_PROJECT']);original=SOURCE.read_bytes();project=json.loads(original)
OUT=pathlib.Path(os.environ.get('TEST_OUTPUT_DIR','/tmp/ohanashi-source-tests'));OUT.mkdir(parents=True,exist_ok=True)
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT/'dist')))
threading.Thread(target=server.serve_forever,daemon=True).start();checks=[]
def check(name,ok):
 assert ok,name
 checks.append(name);print('PASS',name,flush=True)
def data(page):return page.evaluate('JSON.parse(JSON.stringify(state))')
def content(p):return [(c['id'],c['text'],c['cuts']) for c in p['chapters']]
def nonblank(p):return [(c['id'],[l for l in c['text'].split('\n') if l.strip()],[x['id'] for x in c['cuts']]) for c in p['chapters']]
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium'))
  ctx=browser.new_context(accept_downloads=True);ctx.route('https://fonts.googleapis.com/**',lambda r:r.abort())
  page=ctx.new_page();page.goto('http://127.0.0.1:'+str(server.server_port));empty=data(page)
  page.locator('#file').set_input_files(str(SOURCE))
  with page.expect_download() as backup:page.locator('#restore').click()
  check('import backs up previous project before replacing it',json.loads(pathlib.Path(backup.value.path()).read_text())==empty)
  check('source imports with exact body, chapter IDs and cut IDs',content(data(page))==content(project))
  page.reload();check('source survives save and reload exactly',content(data(page))==content(project))
  for index,c in enumerate(project['chapters']):
   page.evaluate("id=>{active=id;render()}",c['id']);baseline=data(page)
   page.evaluate("()=>{for(let i=0;i<3;i++){renderText();capture()}save()}")
   check('render/capture cycles preserve original body and IDs chapter '+str(index+1),content(data(page))==content(project))
   baseline=data(page)
   page.evaluate("()=>{const ed=$('#editor'),blocks=[...ed.children].filter(p=>!p.dataset.cutId&&p.textContent.trim()),r=document.createRange();r.setStart(blocks[0],0);r.setEnd(blocks[1],blocks[1].childNodes.length);getSelection().removeAllRanges();getSelection().addRange(r);ed.focus()}")
   page.locator('[data-insert=scene]').click()
   check('batch style preserves original body and IDs chapter '+str(index+1),content(data(page))==content(project))
   page.locator('#editor').press('Control+z')
   check('batch style Undo exact chapter '+str(index+1),data(page)==baseline)
   page.locator('#autoFormat').click();page.locator('#cancelAutoFormat').click()
   check('autoformat preview cancel changes nothing chapter '+str(index+1),data(page)==baseline)
   page.locator('#autoFormat').click();page.locator('#applyAutoFormat').click()
   check('reviewed autoformat preserves original body and IDs chapter '+str(index+1),content(data(page))==content(project))
   if data(page)!=baseline:page.locator('#editor').press('Control+z')
   check('reviewed autoformat Undo or unchanged no-op exact chapter '+str(index+1),data(page)==baseline)
   page.locator('#check').click();button=page.get_by_text('増殖した空行を整理',exact=True)
   if button.count():
    button.click();repaired=data(page)
    check('blank compression preserves ordered body and IDs chapter '+str(index+1),nonblank(repaired)==nonblank(baseline))
    page.locator('#editor').press('Control+z');check('compression Undo exact chapter '+str(index+1),data(page)==baseline)
    page.locator('#editor').press('Control+Shift+z');check('compression Redo exact chapter '+str(index+1),data(page)==repaired)
    page.locator('#editor').press('Control+z')
   else:page.locator('#close').click()
  page.reload();check('all original text and IDs retained after editing/reload',content(data(page))==content(project))
  with page.expect_download() as backup:page.locator('#backup').click()
  check('backup roundtrip retains original body and IDs',content(json.loads(pathlib.Path(backup.value.path()).read_text()))==content(project))
  timing=page.evaluate('ScriptTiming.analyze(state)');timing.pop('cuts')
  (OUT/'timing.json').write_text(json.dumps(timing,ensure_ascii=False,indent=2))
  browser.close()
finally:server.shutdown();server.server_close()
check('attachment remains byte-for-byte unchanged',SOURCE.read_bytes()==original)
(OUT/'checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2))
print(len(checks),'private source checks passed; source was not copied to repository')
