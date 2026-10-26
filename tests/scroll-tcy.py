"""Hyphens between numbers sit in the column center; scrollbars fade quickly and stay faint."""
import functools,http.server,pathlib,shutil,threading
from playwright.sync_api import sync_playwright
from font_support import fonts
ROOT=pathlib.Path(__file__).resolve().parents[1]
class H(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*a):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(H,directory=str(ROOT/'dist')));threading.Thread(target=server.serve_forever,daemon=True).start()
checks=[];errors=[]
def check(name,condition=True):
 assert condition,name
 checks.append(name);print('PASS',name,flush=True)
try:
 with sync_playwright() as engine:
  browser=engine.chromium.launch(executable_path=shutil.which('chromium'))
  c=browser.new_context(viewport={'width':1400,'height':900});fonts(c);p=c.new_page();p.on('pageerror',lambda e:errors.append(str(e)));p.goto(f'http://127.0.0.1:{server.server_port}');p.evaluate('window.manuscriptReady');p.evaluate('document.fonts.ready')
  p.evaluate("()=>{state=validate({...initial,chapters:[{id:'a',title:'一',text:'自宅（早朝5-6時）\\nA--B\\nハイフン---三つ\\n'+'長い本文。'.repeat(3000)}]});active='a';render()}")
  spans=p.evaluate("[...document.querySelectorAll('#editor p')].slice(0,4).map(p=>[...p.querySelectorAll('.tcy')].map(x=>x.textContent))")
  check('single and double hyphens are upright-combined like digits',spans[1]==['5','-','6'] and spans[2]==['A','--','B'])
  check('long hyphen runs are not combined',spans[3]==[])
  offsets=p.evaluate("()=>[...document.querySelectorAll('#editor p')[1].querySelectorAll('.tcy')].map(x=>{const r=x.getBoundingClientRect();return Math.round((r.left+r.right)/2)})")
  check('hyphen is centered on the same axis as the digits',max(offsets)-min(offsets)<=1)
  check('source text is unchanged',p.evaluate("chapter().text.startsWith('#C1\\n自宅（早朝5-6時）\\nA--B')"))
  ed="document.querySelector('#editor')"
  check('Chromium uses the hover-capable scrollbar styling',p.evaluate(f"getComputedStyle({ed}).scrollbarColor")=='auto')
  p.evaluate(f"()=>{{{ed}.scrollLeft=-300}}");p.wait_for_timeout(100);check('scrollbar shows while scrolling',p.evaluate(f"{ed}.classList.contains('scroll-active')"))
  p.wait_for_timeout(600);check('scrollbar fades within 600ms',not p.evaluate(f"{ed}.classList.contains('scroll-active')"))
  check('no application exceptions',not errors)
finally:server.shutdown()
print(len(checks),'scrollbar/tcy checks passed')
