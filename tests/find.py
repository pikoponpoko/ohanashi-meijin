"""Find and replace: every chapter, cut IDs kept, one Undo step, cut labels never touched."""
import functools,http.server,os,pathlib,shutil,threading
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
def cut_ids(s):return [[x['id'] for x in c['cuts']] for c in s['chapters']]
with sync_playwright() as engine:
 browser=engine.chromium.launch(executable_path=shutil.which('chromium'))
 for width,height in [(1400,900),(390,844)]:
  c=browser.new_context(viewport={'width':width,'height':height});c.route('https://fonts.googleapis.com/**',lambda r:r.abort());p=c.new_page();p.on('pageerror',lambda e:errors.append(str(e)));p.goto(BASE);p.evaluate('window.manuscriptReady')
  p.evaluate("""()=>{state=validate({...initial,title:'試験',chapters:[
   {id:'a',version:2,title:'一章',status:'未着手',text:'#C1\\n○駅（朝）\\n　　　太郎が走る。\\n太郎「待って、太郎」\\n#C2\\nSE：太郎の足音',cuts:[{id:'cut-a1',line:0},{id:'cut-a2',line:4}]},
   {id:'b',title:'二章',status:'未着手',text:'#C1\\n　　　太郎、Taro と書く。\\n花子「C1」',cuts:[{id:'cut-b1',line:0}]}]});
   active='a';render();resetHistory();save()}""")
  before=data(p)
  p.keyboard.press('Control+f')
  check(f'{width}: Ctrl+F opens the panel',p.locator('#findBox').is_visible())
  p.locator('#findQuery').fill('太郎')
  check(f'{width}: hits across chapters',p.locator('.findHit').count()==5)
  check(f'{width}: count shown',p.locator('#findCount').inner_text()=='5件')
  p.locator('#findQuery').fill('　')
  check(f'{width}: action indentation is not a hit',p.locator('.findHit').count()==0)
  p.locator('#findQuery').fill('C1')
  check(f'{width}: cut labels are not hits',p.locator('.findHit').count()==1)
  p.locator('#findQuery').fill('taro')
  check(f'{width}: case-insensitive by default',p.locator('.findHit').count()==1)
  p.locator('#findCase').check()
  check(f'{width}: case option',p.locator('.findHit').count()==0)
  p.locator('#findCase').uncheck()
  p.locator('#findQuery').fill('太郎');p.locator('#findQuery').press('Enter');p.locator('#findQuery').press('Enter')
  check(f'{width}: Enter steps to the next hit',p.locator('#findCount').inner_text()=='2 / 5件')
  check(f'{width}: focus stays in the panel',p.evaluate("document.activeElement.id")=='findQuery')
  p.locator('.findHit').nth(4).click()
  check(f'{width}: hit in another chapter opens it',p.evaluate('active')=='b')
  p.locator('#findReplace').fill('次郎');p.locator('#findReplaceOne').click()
  s=data(p)
  check(f'{width}: replace one',s['chapters'][1]['text'].split('\n')[1]=='　　　次郎、Taro と書く。' and p.locator('.findHit').count()==4)
  check(f'{width}: moves on to the next remaining hit',p.evaluate('active')=='a' and p.locator('#findCount').inner_text()=='4 / 4件')
  p.locator('#findReplaceAll').click()
  s=data(p)
  check(f'{width}: replace all',not any('太郎' in ch['text'] for ch in s['chapters']) and s['chapters'][0]['text'].split('\n')[3]=='次郎「待って、次郎」')
  check(f'{width}: cut IDs and lines kept',cut_ids(s)==cut_ids(before) and [[x['line'] for x in ch['cuts']] for ch in s['chapters']]==[[x['line'] for x in ch['cuts']] for ch in before['chapters']])
  check(f'{width}: sound cue kept',s['chapters'][0]['soundCues']['entries'][0]['raw']=='SE：次郎の足音')
  p.locator('#findQuery').fill('花子「C1」');p.locator('#findReplace').fill('#C9');p.locator('#findReplaceAll').click()
  check(f'{width}: replacement that would make a cut label is refused',data(p)['chapters'][1]['text'].split('\n')[2]=='花子「C1」')
  p.keyboard.press('Escape')
  check(f'{width}: Esc closes',p.locator('#findBox').count()==0)
  p.locator('#editor').focus();p.keyboard.press('Control+z')
  s=data(p)
  check(f'{width}: one Undo reverts replace all',s['chapters'][0]['text']==before['chapters'][0]['text'] and '次郎' in s['chapters'][1]['text'])
  p.keyboard.press('Control+z')
  check(f'{width}: second Undo reverts replace one',[ch['text'] for ch in data(p)['chapters']]==[ch['text'] for ch in before['chapters']])
  p.keyboard.press('Control+h')
  check(f'{width}: Ctrl+H focuses replace',p.evaluate("document.activeElement.id")=='findReplace')
  p.screenshot(path=os.environ.get('FIND_SHOT',f'/tmp/find-{width}.png'))
  c.close()
 browser.close()
assert not errors,errors
print(len(checks),'checks passed')
