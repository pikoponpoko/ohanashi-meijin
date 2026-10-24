"""Isolated browser regression using a synthetic fixture from actual Prepro export syntax."""
import functools,http.server,json,os,pathlib,shutil,threading
from playwright.sync_api import sync_playwright

def open_chapters(page):
    if page.locator('#chapterPanel').is_hidden():page.locator('#menu').click()
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=pathlib.Path(os.environ.get('TEST_OUTPUT_DIR','/tmp/ohanashi-txt-tests'));OUT.mkdir(parents=True,exist_ok=True)
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT/'dist')))
threading.Thread(target=server.serve_forever,daemon=True).start();checks=[]
def check(name,ok=True):
 assert ok,name
 checks.append(name);print('PASS',name,flush=True)
def data(page):return page.evaluate('JSON.parse(JSON.stringify(state))')
def body(chapter):
 lines=chapter['text'].split('\n');indices={c['line'] for c in chapter['cuts']}
 return '\n'.join(s for i,s in enumerate(lines) if i not in indices)
raw=(ROOT/'tests/fixtures/prepro-synthetic.txt').read_text()
expected='\n'.join(s for s in raw.split('\n') if not s.startswith('#')).removeprefix('\n')
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium'))
  def new_page():
   ctx=browser.new_context();ctx.route('https://fonts.googleapis.com/**',lambda r:r.abort())
   page=ctx.new_page();page.goto('http://127.0.0.1:'+str(server.server_port));return page
  def import_file(page,text=raw):
   page.locator('#file').set_input_files({'name':'prepro-fixture.txt','mimeType':'text/plain','buffer':text.encode()})
   page.wait_for_function("chapter().title==='prepro-fixture'")
  page=new_page();before=data(page);import_file(page)
  imported=data(page);c=imported['chapters'][0]
  check('TXT replaces only untouched starter; real first cut is C1',len(imported['chapters'])==1 and len(c['cuts'])==4 and c['cuts'][0]['line']==0 and c['text'].startswith('#C1\n【駅・朝】'))
  check('duplicates gaps and branches preserve original cut order and body',body(c)==expected and [c['text'].split('\n')[x['line']] for x in c['cuts']]==['#C1','#C2','#C3','#C4'])
  check('cut labels render once and never as ordinary paragraphs',page.locator('#editor .cut').count()==4 and page.evaluate("[...document.querySelectorAll('#editor p:not(.cut)')].every(p=>!/^\\s*#\\s*C\\s*\\d/.test(p.textContent))"))
  check('generated IDs are unique and unrelated to labels',len({x['id'] for x in c['cuts']})==4 and all(len(x['id'])==36 for x in c['cuts']))
  page.locator('#editor').press('Control+z');check('file import is one exact Undo',data(page)==before)
  page.locator('#editor').press('Control+Shift+z');check('file import Redo retains exact imported IDs and body',data(page)==imported)
  page.reload();check('saved TXT survives reload exactly',data(page)==imported)
  page.locator('#check').click()
  compress=page.get_by_text('増殖した空行を整理',exact=True)
  check('fixture exercises actual blank compression',compress.count()==1)
  compress.click();repaired=data(page)
  check('automatic correction keeps all imported cut IDs',[x['id'] for x in repaired['chapters'][0]['cuts']]==[x['id'] for x in c['cuts']])
  page.locator('#editor').press('Control+z');check('automatic correction Undo exact',data(page)==imported)
  page.locator('#editor').press('Control+Shift+z');check('automatic correction Redo exact',data(page)==repaired)
  page.evaluate('()=>{for(let i=0;i<10;i++){renderText();capture()}save()}');stable=data(page);page.reload()
  check('ten render/capture/save cycles preserve cut count IDs and body',data(page)==stable and [x['id'] for x in data(page)['chapters'][0]['cuts']]==[x['id'] for x in c['cuts']] and body(data(page)['chapters'][0])==body(repaired['chapters'][0]))
  # The PWA branch additionally offers explicit removal of all blank paragraphs.
  page.locator('#check').click();remove=page.get_by_text('空行を削除',exact=True)
  if remove.count():
   old=data(page);remove.click();clean=data(page)
   check('explicit blank removal retains all imported cut IDs',[x['id'] for x in clean['chapters'][0]['cuts']]==[x['id'] for x in c['cuts']])
   page.locator('#editor').press('Control+z');check('blank removal Undo restores imported text exactly',data(page)==old)
   page.locator('#editor').press('Control+Shift+z');check('blank removal Redo exact',data(page)==clean)
   page.reload();check('blank removal reload retains IDs and body',data(page)==clean)
  else:page.locator('#close').click()
  page.screenshot(path=str(OUT/'imported.png'))
  for mode in ['fresh','selected-all','existing']:
   page=new_page()
   if mode!='fresh':page.evaluate("()=>{state=validate({...initial,title:'既存原稿',chapters:[{id:'original',title:'元の章',text:'元本文'}]});active='original';render();resetHistory();save()}")
   old=data(page)
   if mode=='selected-all':page.evaluate("()=>{const r=document.createRange();r.selectNodeContents($('#editor'));getSelection().removeAllRanges();getSelection().addRange(r)}")
   else:page.evaluate("()=>caretEnd($('#editor').lastElementChild)")
   page.evaluate("text=>{const dt=new DataTransfer();dt.setData('text/plain',text);$('#editor').dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}))}",raw)
   pasted=data(page);chapter=pasted['chapters'][0]
   check('paste imported boundaries without extra starter '+mode,len(chapter['cuts'])==(5 if mode=='existing' else 4))
   check('paste keeps ordered incoming words '+mode,expected.strip() in body(chapter))
   page.locator('#editor').press('Control+z');check('paste Undo exact '+mode,data(page)==old)
   page.locator('#editor').press('Control+Shift+z');check('paste Redo exact '+mode,data(page)==pasted)
   page.evaluate('save()');page.reload();check('paste reload IDs stable '+mode,data(page)==pasted)
  page=new_page();page.evaluate("()=>{state=validate({...initial,title:'既存作品',chapters:[{id:'old',title:'保持する章',text:'本文\\n#C5\\n'}]});active='old';render();resetHistory();save()}");old=data(page)
  import_file(page);after=data(page)
  check('existing project chapter/body/cut IDs untouched',len(after['chapters'])==2 and after['chapters'][0]==old['chapters'][0])
  check('import into existing project preserves global consecutive numbering',page.evaluate("state.chapters.flatMap(c=>c.cuts.map(x=>c.text.split('\\n')[x.line])).join(',')==='#C1,#C2,#C3,#C4,#C5,#C6'"))
  page.locator('#editor').press('Control+z');check('existing project import Undo exact',data(page)==old)
  page.locator('#editor').press('Control+Shift+z');check('existing project import Redo exact',data(page)==after)
  for source in ['\ufeff\r\n# C1\r\n一\r\n#C1A\r\n二','\n#C9\n一\n#C4\n二','#プリプロ名人 台詞一覧（このまま書き換えて、コピーしてからプリプロ名人に戻ると反映できます）\n\n# C1\n一\n# C2\n二']:
   page=new_page();import_file(page,source);c=data(page)['chapters'][0]
   check('legacy header BOM/padding variation gives two real cuts',len(c['cuts'])==2 and c['text']=='#C1\n一\n#C2\n二')
  browser.close()
finally:server.shutdown();server.server_close()
(OUT/'checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2))
print(len(checks),'TXT import checks passed')
