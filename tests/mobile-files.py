"""Mobile file providers and storage exhaustion, using isolated synthetic profiles."""
import functools,http.server,json,os,pathlib,shutil,threading
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/mobile-files';OUT.mkdir(parents=True,exist_ok=True)
class H(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*a):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(H,directory=str(ROOT/'dist')));threading.Thread(target=server.serve_forever,daemon=True).start()
BASE=os.environ.get('TEST_BASE_URL',f'http://127.0.0.1:{server.server_port}');checks=[];errors=[]
def check(name,condition=True):
 assert condition,name
 checks.append(name);print('PASS',name,flush=True)
def data(p):return p.evaluate('JSON.parse(JSON.stringify(state))')
def storage(p):return p.evaluate('({...localStorage})')
def settle(p):p.wait_for_function('!switchingDocument&&!document.querySelector("main").inert')
def open_file(p,name,content,mime='application/octet-stream'):
 p.locator('#file').set_input_files({'name':name,'mimeType':mime,'buffer':content.encode()})
 p.wait_for_function("document.querySelector('#file').value===''")
 if p.locator('#openWithoutSaving').is_visible():p.locator('#openWithoutSaving').click()
 settle(p)
def seed(p):
 p.evaluate("()=>{state=validate({...initial,title:'保持する作品',dark:true,chapters:[{id:'original',title:'第一章',text:'消さない本文'}]});active='original';render();resetHistory();save();localStorage.setItem('archive-witness','退避');localStorage.setItem('other-setting','元設定')}")
def new(p):p.locator('#newDocument').click();p.locator('#confirmNewDocument').click();settle(p)
try:
 with sync_playwright() as engine:
  browser=engine.chromium.launch(executable_path=shutil.which('chromium'))
  def page():
   c=browser.new_context(is_mobile=True,has_touch=True,viewport={'width':390,'height':844});c.route('https://fonts.googleapis.com/**',lambda r:r.abort());p=c.new_page();p.on('pageerror',lambda e:errors.append(str(e)));p.goto(BASE);p.evaluate('window.manuscriptReady');return p
  p=page();seed(p);old=data(p)
  incoming={'version':1,'title':'BIN扱いのJSON','chapters':[{'id':'incoming','title':'第一章','text':'JSON本文'}]}
  p.evaluate("incoming=>{window.pickerOptions=null;window.showOpenFilePicker=async options=>{window.pickerOptions=options;return [{getFile:async()=>new File([JSON.stringify(incoming)],'作品.json',{type:'application/octet-stream'})}]}}",incoming)
  p.locator('#import').click();p.wait_for_selector('#openWithoutSaving');p.locator('#openWithoutSaving').click();p.wait_for_function("state.title==='BIN扱いのJSON'")
  check('Android picker has no MIME or extension restriction',p.evaluate('!pickerOptions.types&&!pickerOptions.excludeAcceptAllOption'))
  check('BIN/octet-stream JSON opens and previous manuscript is archived',p.evaluate("archivedDocuments().some(x=>JSON.parse(x.raw).title==='保持する作品')"))
  p=page();seed(p);old=data(p)
  for i in range(5):
   open_file(p,'繰り返し.txt','#C1\n最初\n#C2\n最後','text/plain')
   check('TXT open '+str(i+1)+' creates a separate two-cut work',len(data(p)['chapters'])==1 and len(data(p)['chapters'][0]['cuts'])==2 and data(p)['chapters'][0]['text']=='#C1\n最初\n#C2\n最後')
  check('TXT opening retains original manuscript exactly',p.evaluate('old=>archivedDocuments().some(x=>x.raw===JSON.stringify(old))',old))
  p=page();seed(p);p.evaluate("()=>{state.rate=840;state.actionSeconds=17;state.speechPause=1.3;state.timingMode='sequential';save()}");new(p)
  check('blank work retains display and timing preferences',p.evaluate("state.dark&&state.rate===840&&state.actionSeconds===17&&state.speechPause===1.3&&state.timingMode==='sequential'"))
  open_file(p,'settings.txt','本文','text/plain')
  check('TXT work retains display and timing preferences',p.evaluate("state.dark&&state.rate===840&&state.actionSeconds===17&&state.speechPause===1.3&&state.timingMode==='sequential'"))
  p=page();seed(p)
  p.evaluate("""()=>{let low=0,high=6*1024*1024;while(low+1<high){const mid=Math.floor((low+high)/2);try{localStorage.setItem('capacity-witness','x'.repeat(mid));low=mid}catch(e){if(e.name!=='QuotaExceededError')throw e;high=mid}}}""")
  full=storage(p);old=data(p);new(p)
  check('real browser quota exhaustion allows a safe blank start',data(p)['title']=='' and p.evaluate('ManuscriptStorage.usingDatabase'))
  check('actual full storage is preserved without evicting any keys',storage(p)==full)
  open_file(p,'large.json',json.dumps({**incoming,'chapters':[{'id':'large','title':'第一章','text':'本文'*30000}]},ensure_ascii=False))
  check('JSON larger than old active document opens with actual storage full',data(p)['title']==incoming['title'] and storage(p)==full)
  p.reload();p.evaluate('window.manuscriptReady');check('real quota fallback survives reload',len(data(p)['chapters'][0]['text'])>50000 and storage(p)==full)
  p=page();seed(p);good=p.evaluate('localStorage.getItem(KEY)');p.evaluate('chapter().cuts[0].line=99;dirty=true');bad=p.evaluate('JSON.stringify(state)');new(p)
  check('new work retains invalid draft and last valid saved bytes',p.evaluate('([good,bad])=>[good,bad].every(raw=>archivedDocuments().some(x=>x.raw===raw))',[good,bad]))
  p=page();seed(p);p.evaluate("()=>{for(let i=0;i<2;i++)localStorage.setItem(ARCHIVE_PREFIX+'legacy-'+i,JSON.stringify({raw:'legacy '+i}))}");new(p)
  check('legacy archives without timestamps cannot block a new work',data(p)['title']=='' and p.evaluate("localStorage.getItem(ARCHIVE_PREFIX+'legacy-0')===JSON.stringify({raw:'legacy 0'})&&archivedDocuments().length===3"))
  p=page();seed(p);old=data(p);raw=storage(p)
  p.evaluate("()=>{Storage.prototype.setItem=function(){throw new DOMException('full','QuotaExceededError')}}")
  new(p);check('new work succeeds with localStorage full',data(p)['title']=='' and p.evaluate('ManuscriptStorage.usingDatabase'))
  check('all existing localStorage bytes are retained',storage(p)==raw)
  check('old manuscript is archived before switching',p.evaluate('old=>archivedDocuments().some(x=>x.raw===JSON.stringify(old))',old))
  open_file(p,'mobile.json',json.dumps(incoming,ensure_ascii=False));check('JSON opens while localStorage is full',data(p)['title']==incoming['title'])
  p.evaluate("()=>{chapter().title='保存後の章';save()}");p.wait_for_function('!dirty');saved=data(p);p.reload();p.evaluate('window.manuscriptReady')
  check('overflow manuscript and settings survive reload',data(p)==saved and storage(p)==raw)
  p.evaluate("localStorage.setItem(KEY,'{broken')");p.reload();p.evaluate('window.manuscriptReady');p.wait_for_timeout(550)
  check('valid overflow document takes priority over corrupt legacy storage',data(p)==saved and not p.evaluate('loadBlocked') and '自動保存は停止' not in p.locator('#toast').inner_text())
  p.locator('#savedDocuments').click();p.get_by_role('button',name='保持する作品 ·',exact=False).click();settle(p)
  check('overflow archive reopens exact original IDs and settings',data(p)==old)
  p.goto(BASE+'/recovery.html');p.wait_for_function("!document.querySelector('#saveRecovery').disabled")
  with p.expect_download() as download:p.locator('#saveRecovery').click()
  check('recovery exports latest overflow document',json.loads(pathlib.Path(download.value.path()).read_text())==old)
  other=p.context.new_page();other.goto(BASE);other.evaluate('window.manuscriptReady');other.evaluate("()=>{state.title='別の画面の更新';return save()}")
  p.locator('#repairConnection').click();p.wait_for_function("document.querySelector('#status').textContent.includes('更新')")
  check('recovery rejects an outdated backup after database update',not p.url.endswith('recovered=1'))
  p=page();seed(p);old=data(p);raw=storage(p)
  p.evaluate("()=>{Storage.prototype.setItem=function(){throw new DOMException('full','QuotaExceededError')};ManuscriptStorage.commit=async()=>{throw Error('Both stores unavailable')}}")
  new(p);check('both storage failures abort switch with original intact',data(p)==old and storage(p)==raw)
  p=page();seed(p);old=data(p);raw=storage(p)
  p.evaluate("()=>{Storage.prototype.setItem=function(){throw new DOMException('full','QuotaExceededError')};const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value){if(value.key==='active')throw new DOMException('full','QuotaExceededError');return put.call(this,value)}}")
  new(p);check('failed active write aborts the entire archive transaction',data(p)==old and storage(p)==raw)
  check('failed switch leaves no partial database archive',p.evaluate("()=>new Promise(resolve=>{const q=indexedDB.open('ohanashi-manuscripts-v1');q.onsuccess=()=>{const r=q.result.transaction('records').objectStore('records').getAll();r.onsuccess=()=>resolve(r.result.length===0)}})"))
  check('no application exceptions',not errors);browser.close()
finally:server.shutdown();server.server_close()
(OUT/'checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2));print(len(checks),'mobile file checks passed')
