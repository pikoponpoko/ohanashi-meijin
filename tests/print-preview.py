"""Print preview: page count, two tiers, print size, and print media."""
import functools,http.server,json,pathlib,shutil,threading
from playwright.sync_api import sync_playwright
from font_support import fonts
ROOT=pathlib.Path(__file__).resolve().parents[1];OUT=pathlib.Path('/tmp/ohanashi-print-preview-tests');OUT.mkdir(exist_ok=True)
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT/'dist')));threading.Thread(target=server.serve_forever,daemon=True).start();checks=[]
def check(name,ok=True):
 assert ok,name
 checks.append(name);print('PASS',name,flush=True)
def count(page):
 page.wait_for_function("/^A4 \\d+枚$/.test($('#previewCount').textContent)&&!$('#previewBar').classList.contains('busy')",timeout=120000)
 return int(page.locator('#previewCount').text_content()[3:-1])
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=shutil.which('chromium'));ctx=browser.new_context(viewport={'width':1280,'height':800});fonts(ctx);page=ctx.new_page();page.goto('http://127.0.0.1:'+str(server.server_port))
  body='\n'.join(['#C'+str(i)+'\n　　　ト書きの本文がここに入ります。動作の描写。\n人「台詞の行です。少し長めの台詞を書いておきます。」' for i in range(1,80)])
  page.evaluate("text=>{state=validate({...initial,title:'プレビュー',cover:true,chapters:[{id:'a',title:'一',text},{id:'b',title:'二',text:'#C1\\n　　　短い章。'}]});active='a';render();resetHistory();save();window.printCalls=0;window.print=()=>{window.printCalls++}}",body)
  before=page.evaluate('JSON.stringify(state.chapters)')
  page.keyboard.press('Control+p')
  one=count(page);check('preview opens with A4 page count',one>2 and page.evaluate('window.printCalls')==0)
  check('count matches rendered pages',one==page.locator('#printRoot > .printpage').count())
  page.screenshot(path=str(OUT/'one.png'))
  page.locator('[data-columns="2"]').click();two=count(page)
  check('two tiers reduce pages',two<one and page.evaluate('state.printColumns')==2)
  check('two tiers stack inside the page',page.evaluate("()=>[...document.querySelectorAll('.printtiers')].every(t=>{const [a,b]=t.querySelectorAll('.printbody');return a&&a.getBoundingClientRect().bottom<=(b?b.getBoundingClientRect().top:1e9)})&&[...document.querySelectorAll('.printbody')].every(b=>b.scrollWidth<=b.clientWidth+2)"))
  check('chapter two continues on same page',page.evaluate("()=>[...document.querySelectorAll('.printfoot span:nth-child(2)')].some(s=>s.textContent==='一 / 二')"))
  page.evaluate("document.querySelectorAll('.printpage')[1].scrollIntoView()");page.screenshot(path=str(OUT/'two.png'))
  page.select_option('#previewSize','9');small=count(page);check('smaller print size reduces pages',small<two and page.evaluate('state.printSize')==9)
  page.locator('#previewCover').uncheck();check('cover toggle updates count',count(page)==small-1)
  check('all text kept',page.evaluate("()=>{const n=s=>s.replace(/[\\s\\u3000]/g,'');return n([...document.querySelectorAll('.printbody p:not(.cut)')].map(p=>p.textContent).join(''))===n(state.chapters.map(c=>c.text.split('\\n').filter((l,i)=>!c.cuts.some(x=>x.line===i)).join('')).join(''))}"))
  page.emulate_media(media='print');check('print media hides toolbar and resets zoom',page.evaluate("()=>getComputedStyle($('#previewBar')).display==='none'&&getComputedStyle($('#printRoot')).position==='static'&&getComputedStyle(document.querySelector('.printpage')).zoom==='1'"));page.emulate_media(media='screen')
  page.keyboard.press('Control+p');check('Ctrl+P prints from preview',page.evaluate('window.printCalls')==1)
  page.keyboard.press('Escape');check('Escape closes preview',not page.evaluate("document.body.classList.contains('printpreview')") and page.locator('#printRoot > *').count()==0)
  check('preview leaves manuscript untouched',page.evaluate('JSON.stringify(state.chapters)')==before)
  page.reload();check('print settings persist',page.evaluate('[state.printColumns,state.printSize,state.cover]')==[2,9,False])
  browser.close()
finally:server.shutdown();server.server_close()
(OUT/'checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2));print(len(checks),'print preview checks passed')
