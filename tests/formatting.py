"""Paragraph style and deterministic proposal acceptance in isolated browser storage."""
import functools,http.server,json,os,pathlib,shutil,threading
from playwright.sync_api import sync_playwright
from font_support import fonts

def open_chapters(page):
    if page.locator('#chapterPanel').is_hidden():page.locator('#menu').click()
ROOT=pathlib.Path(__file__).resolve().parents[1];OUT=pathlib.Path(os.environ.get('TEST_OUTPUT_DIR','/tmp/ohanashi-format-tests'));OUT.mkdir(parents=True,exist_ok=True)
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT/'dist')))
threading.Thread(target=server.serve_forever,daemon=True).start();checks=[]
def check(name,ok=True):
 assert ok,name
 checks.append(name);print('PASS',name,flush=True)
def data(page):return page.evaluate('JSON.parse(JSON.stringify(state))')
def setup(page,text):
 page.evaluate("""text=>{state=validate({...initial,title:'書式確認',chapters:[{id:'chapter',title:'第一章',text}]});active='chapter';render();resetHistory();save()}""",text)
def select(page,start,end,start_offset=0,end_offset=None):
 page.evaluate("""({start,end,start_offset,end_offset})=>{const ed=$('#editor'),r=document.createRange(),a=ed.children[start],b=ed.children[end];if(start_offset)r.setStart(a.firstChild,start_offset);else r.setStart(a,0);if(end_offset===null)r.setEnd(b,b.childNodes.length);else r.setEnd(b.firstChild,end_offset);getSelection().removeAllRanges();getSelection().addRange(r);ed.focus();ed.dispatchEvent(new Event('selectionchange',{bubbles:true}))}""",dict(start=start,end=end,start_offset=start_offset,end_offset=end_offset))
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium'))
  ctx=browser.new_context(viewport={'width':1280,'height':900},accept_downloads=True);fonts(ctx)
  page=ctx.new_page();page.goto('http://127.0.0.1:'+str(server.server_port));errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  source='#C1\n○駅\n　　　動作を書く\n人物「発言」\n#C2\n続き'
  setup(page,source);before=data(page);select(page,1,3,1,2)
  page.locator('[data-insert=dialogue]').click();styled=data(page)
  check('multiple partial paragraphs wrap quotes without losing words or IDs',styled['chapters'][0]['text']=='#C1\n「○駅」\n「　　　動作を書く」\n人物「発言」\n#C2\n続き' and styled['chapters'][0]['cuts']==before['chapters'][0]['cuts'] and styled['chapters'][0]['formats'][1:4]==['dialogue']*3)
  check('style buttons never insert templates',page.locator('#editor').inner_text().count('人物名「セリフ」')==0 and len(styled['chapters'][0]['text'].split('\n'))==6)
  check('selection remains in editor after format click',page.evaluate("$('#editor').contains(getSelection().anchorNode)&&!getSelection().isCollapsed"))
  page.locator('#editor').press('Control+z');check('batch format is exactly one Undo',data(page)==before)
  page.locator('#editor').press('Control+Shift+z');check('batch format Redo exact',data(page)==styled)
  page.reload();check('manual formats persist through reload',data(page)==styled)
  page.evaluate('()=>{for(let i=0;i<10;i++){renderText();capture()}save()}');check('ten cycles preserve manual styles and exact raw indentation',data(page)==styled)
  select(page,3,3,1,1);page.locator('[data-insert=action]').click()
  check('collapsed caret formats its whole paragraph',data(page)['chapters'][0]['formats'][3]=='action' and data(page)['chapters'][0]['text']==styled['chapters'][0]['text'])
  baseline=data(page);select(page,0,0);page.locator('[data-insert=scene]').click();check('cut boundary cannot be restyled',data(page)==baseline)
  select(page,1,2,0,0);page.locator('[data-insert=scene]').click()
  check('selection ending at next paragraph start excludes that paragraph',data(page)['chapters'][0]['formats'][1]=='scene' and data(page)['chapters'][0]['formats'][2]=='dialogue')
  baseline=data(page);select(page,2,2);page.evaluate('composing=true');page.locator('[data-insert=scene]').click();page.evaluate('composing=false');check('IME flag blocks batch formatting',data(page)==baseline)
  page.evaluate("()=>$('#editor').dispatchEvent(new KeyboardEvent('keydown',{key:'1',altKey:true,isComposing:true,bubbles:true}))");check('IME keyboard event blocks formatting',data(page)==baseline)
  select(page,2,2);page.keyboard.press('Alt+1');check('Alt1 changes kind and adds one scene symbol',data(page)['chapters'][0]['formats'][2]=='scene' and data(page)['chapters'][0]['text'].split('\n')[2].startswith('◯'))
  open_chapters(page);page.locator('#chapterTitle').focus();baseline=data(page);page.keyboard.press('Alt+2');check('chapter title input does not trigger format shortcut',data(page)==baseline)
  # Custom clipboard carries chosen paragraph kinds, including text without a scene prefix.
  select(page,2,2)
  page.evaluate("()=>{window.clip=new DataTransfer();$('#editor').dispatchEvent(new ClipboardEvent('copy',{clipboardData:clip,bubbles:true,cancelable:true}))}")
  check('copy records retain manually selected kind',page.evaluate("JSON.parse(clip.getData('application/x-ohanashi')).records[0].kind==='scene'"))
  open_chapters(page);page.locator('#add').click();page.locator('#createChapter').click();page.evaluate("()=>{caretEnd($('#editor').lastElementChild);$('#editor').dispatchEvent(new ClipboardEvent('paste',{clipboardData:clip,bubbles:true,cancelable:true}))}")
  check('paste keeps manual kind and original words',page.evaluate("chapter().formats.includes('scene')&&chapter().text.includes('動作を書く')"))
  # Move the selected paragraph to a chapter with its stored format.
  setup(page,source);select(page,2,2);page.locator('[data-insert=scene]').click();select(page,2,2);moved_before=data(page)
  open_chapters(page);page.locator('#splitChapter').click();page.locator('#confirmSplit').click()
  check('chapter split keeps manual kind without changing words',page.evaluate("chapter().formats.includes('scene')&&chapter().text.includes('動作を書く')"))
  page.locator('#editor').press('Control+z');check('chapter split Undo retains formatted source exactly',data(page)==moved_before)
  # Empty editing-only slot can hold a style without adding a saved blank line.
  setup(page,'#C1');raw=data(page)['chapters'][0]['text'];page.evaluate("()=>caretEnd($('#editor').lastElementChild)");page.locator('[data-insert=dialogue]').click()
  check('empty slot supplies an editable quote pair without extra cuts',data(page)['chapters'][0]['text']==raw+'\n「」' and len(data(page)['chapters'][0]['cuts'])==1)
  page.reload();page.evaluate("()=>caretEnd($('#editor').lastElementChild)");page.keyboard.insert_text('○本文')
  check('typing retains explicitly chosen kind instead of reclassifying from prefix',page.evaluate("chapter().formats[1]==='dialogue'&&$('#editor').lastElementChild.className==='dialogue'") and 'placeholderFormat' not in data(page)['chapters'][0])
  # Proposal preview keeps the manuscript untouched until explicit confirmation.
  auto='#C1\n○場\n　　　扉が開く。\n　　　振り返る。\n澪「折り返し\n続く台詞」\n未判定の文\n#C2\nナレーション「声」'
  setup(page,auto);before=data(page);page.locator('#autoFormat').click();check('automatic proposal preview does not mutate manuscript',data(page)==before)
  check('only uncertain rows offer manual correction',page.locator('.formatPreview select').count()==1)
  page.locator('#cancelAutoFormat').click();check('proposal cancel leaves exact original',data(page)==before)
  page.locator('#autoFormat').click();page.get_by_label('7行目の書式').select_option('scene');page.screenshot(path=str(OUT/'proposal.png'));page.locator('#applyAutoFormat').click();after=data(page)
  check('proposal apply changes formats only with exact text/cut IDs',after['chapters'][0]['text']==before['chapters'][0]['text'] and after['chapters'][0]['cuts']==before['chapters'][0]['cuts'])
  check('scene is not a cut or picture and action lines remain separate',len(after['chapters'][0]['cuts'])==2 and after['chapters'][0]['formats'][1:4]==['scene','action','action'])
  check('wrapped speech stays speech and manual uncertainty correction applies',after['chapters'][0]['formats'][4:7]==['dialogue','dialogue','scene'])
  page.locator('#editor').press('Control+z');check('proposal apply is one exact Undo',data(page)==before)
  page.locator('#editor').press('Control+Shift+z');check('proposal Redo exact',data(page)==after)
  page.reload();check('proposal formatting persists on reload',data(page)==after)
  page.locator('#autoFormat').click();page.evaluate("chapter().text+='変更'");page.locator('#applyAutoFormat').click();check('stale proposal does not overwrite a changed manuscript',page.locator('#dialog').is_visible() and page.evaluate("chapter().text.endsWith('変更')"));page.locator('#close').click()
  setup(page,'#C1\n漢12漢１２漢！漢？漢 <b>&<>')
  check('typographic markup preserves literal HTML characters and fullwidth source',page.evaluate("$('#editor').children[1].textContent===chapter().text.split('\\n')[1]&&!$('#editor b')"))
  before=data(page);page.evaluate('()=>{renderText();capture();save()}');check('glyph markup roundtrip preserves exact source',data(page)['chapters'][0]['text']==before['chapters'][0]['text'])
  select(page,1,1);page.locator('[data-insert=dialogue]').click();pdf_data=data(page)
  page.evaluate('()=>{window.print=()=>{};return printProject(false)}')
  check('print layout retains manual paragraph kind',page.evaluate("[...document.querySelectorAll('#printRoot .printbody p')].some(p=>p.classList.contains('dialogue'))"))
  with page.expect_download() as download:page.evaluate('()=>printProject(true)')
  download.value.save_as(OUT/'formatted.pdf');check('direct PDF still downloads without changing manuscript',(OUT/'formatted.pdf').read_bytes().startswith(b'%PDF') and data(page)==pdf_data)
  setup(page,'#C1\n　　　#C2\n　　　\n　　　動作')
  before=data(page);page.evaluate('()=>{for(let i=0;i<5;i++){renderText();capture()}save()}')
  check('normalized legacy boundaries and remaining whitespace remain stable',data(page)['chapters'][0]['text']==before['chapters'][0]['text'] and data(page)['chapters'][0]['cuts']==before['chapters'][0]['cuts'])
  check('no runtime errors',not errors);page.screenshot(path=str(OUT/'formatted.png'));browser.close()
finally:server.shutdown();server.server_close()
(OUT/'checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2))
print(len(checks),'formatting checks passed')
