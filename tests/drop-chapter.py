"""Dropped text files open like 開く; switching chapters starts at the first line."""
import functools,http.server,json,os,pathlib,shutil,threading
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
class H(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*a):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(H,directory=str(ROOT/'dist')));threading.Thread(target=server.serve_forever,daemon=True).start()
BASE=os.environ.get('TEST_BASE_URL',f'http://127.0.0.1:{server.server_port}');checks=[];errors=[]
def check(name,condition=True):
 assert condition,name
 checks.append(name);print('PASS',name,flush=True)
def data(p):return p.evaluate('JSON.parse(JSON.stringify(state))')
def settle(p):p.wait_for_function('!switchingDocument&&!document.querySelector("main").inert')
def drop(p,name,content,mime='',target='#editor'):
 p.evaluate("""([name,content,mime,target])=>{const dt=new DataTransfer();dt.items.add(new File([content],name,{type:mime}));
  const el=document.querySelector(target);for(const type of ['dragenter','dragover','drop'])el.dispatchEvent(new DragEvent(type,{bubbles:true,cancelable:true,dataTransfer:dt}))}""",[name,content,mime,target])
 p.wait_for_timeout(200)
 if p.locator('#openWithoutSaving').is_visible():p.locator('#openWithoutSaving').click()
 settle(p)
long='\n'.join('長い本文の行です。'*4 for _ in range(400))
try:
 with sync_playwright() as engine:
  browser=engine.chromium.launch(executable_path=shutil.which('chromium'))
  for width,height in [(1400,900),(390,844)]:
   c=browser.new_context(viewport={'width':width,'height':height});c.route('https://fonts.googleapis.com/**',lambda r:r.abort());p=c.new_page();p.on('pageerror',lambda e:errors.append(str(e)));p.goto(BASE);p.evaluate('window.manuscriptReady')
   p.evaluate("()=>{state=validate({...initial,title:'元の作品',chapters:[{id:'keep',title:'第一章',text:'消さない本文'}]});active='keep';render();resetHistory();save()}")
   old=json.dumps(data(p),ensure_ascii=False)
   drop(p,'作品.json',json.dumps({'version':2,'title':'ドロップJSON','workId':'drop-work','chapters':[{'id':'a','title':'一章','text':'#C1\n'+long,'cuts':[{'id':'cut-a','line':0}]},{'id':'b','title':'二章','text':'#C1\n'+long,'cuts':[{'id':'cut-b','line':0}]}]},ensure_ascii=False),'application/octet-stream')
   check(f'{width}: dropped JSON (octet-stream) opens',data(p)['title']=='ドロップJSON')
   check(f'{width}: previous work archived',p.evaluate("archivedDocuments().some(x=>JSON.parse(x.raw).title==='元の作品'&&x.raw.includes('消さない本文'))"))
   check(f'{width}: dropped file did not insert text into the editor',data(p)['chapters'][0]['text'].startswith('#C1\n長い本文'))
   for i,mode in enumerate(['vertical','horizontal']):
    p.evaluate(f"()=>{{state.direction='{mode}';render()}}")
    ed=p.locator('#editor')
    scroll="(e=>getComputedStyle(e).writingMode)(document.querySelector('#editor'))"
    if mode=='vertical':
     start=p.evaluate("document.querySelector('#editor').scrollLeft")
     p.evaluate("()=>{document.querySelector('#editor').scrollLeft=-100000}");moved=p.evaluate("()=>{const e=document.querySelector('#editor');return [e.scrollLeft,e.scrollWidth,e.clientWidth]}")
     check(f'{width}: vertical chapter is scrollable for the test',moved[1]>moved[2]*2 and moved[0]<start-1000)
     p.locator('#chapters .chapterRow').nth(1).locator('button').nth(1).click() if p.locator('#chapters .chapterRow').nth(1).locator('button').nth(1).is_visible() else p.evaluate("()=>{active='b';render()}")
     p.wait_for_timeout(100)
     check(f'{width}: switching chapter starts at the right edge (vertical)',abs(p.evaluate("document.querySelector('#editor').scrollLeft")-start)<=2 and data(p) is not None and p.evaluate('active')=='b')
    else:
     p.evaluate("()=>{document.querySelector('#editor').scrollTop=100000}")
     p.evaluate("()=>{active=active==='a'?'b':'a';render()}");p.wait_for_timeout(100)
     check(f'{width}: switching chapter starts at the top (horizontal)',p.evaluate("document.querySelector('#editor').scrollTop")==0)
   p.evaluate("()=>{state.direction='vertical';render()}")
   p.evaluate("()=>{const e=document.querySelector('#editor');e.scrollLeft=-3000}");before=p.evaluate("document.querySelector('#editor').scrollLeft")
   p.evaluate("()=>{chapter().text+='\\n追記';render()}");check(f'{width}: re-render of the same chapter keeps the scroll position',p.evaluate("document.querySelector('#editor').scrollLeft")==before)
   drop(p,'メモ.md','# 見出し\n本文','')
   check(f'{width}: dropped Markdown opens as a separate work',data(p)['title']=='メモ')
   drop(p,'台本.txt','#C1\n最初\n#C2\n次','text/plain')
   check(f'{width}: dropped TXT opens as a separate work',data(p)['title']=='台本' and len(data(p)['chapters'][0]['cuts'])==2)
   before=json.dumps(data(p),ensure_ascii=False);drop(p,'画像.png','\x89PNG','image/png')
   check(f'{width}: unsupported dropped file leaves the work unchanged',json.dumps(data(p),ensure_ascii=False)==before)
   p.evaluate("()=>{state.chapters[0].text+='\\n未保存';dirty=true}");drop(p,'別.txt','別の本文','text/plain')
   check(f'{width}: dropped file while unsaved still archives current work',p.evaluate("archivedDocuments().some(x=>x.raw.includes('未保存'))"))
   c.close()
  check('no application exceptions',not errors)
finally:server.shutdown()
print(len(checks),'drop/chapter checks passed')
