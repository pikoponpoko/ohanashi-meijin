"""Post-publication T01-T11 acceptance; isolated storage, real local test fonts."""
import functools,http.server,json,os,pathlib,shutil,threading
from playwright.sync_api import sync_playwright
from font_support import fonts
ROOT=pathlib.Path(__file__).resolve().parents[1];OUT=pathlib.Path(os.environ.get('TEST_OUTPUT_DIR','/tmp/ohanashi-feedback-tests'));OUT.mkdir(parents=True,exist_ok=True)
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT/'dist')));threading.Thread(target=server.serve_forever,daemon=True).start();checks=[]
def check(name,ok=True):
 assert ok,name
 checks.append(name);print('PASS',name,flush=True)
def data(page):return page.evaluate('JSON.parse(JSON.stringify(state))')
def setup(page,text='本文A',**extra):
 page.evaluate("({text,extra})=>{state=validate({...initial,title:'動作確認',...extra,chapters:[{id:'one',title:'第一章',text}]});active='one';render();resetHistory();save();FileControls.markSaved()}",dict(text=text,extra=extra))
def select(page,a=1,b=None):
 if b is None:b=a
 page.evaluate("({a,b})=>{const ed=$('#editor'),r=document.createRange();r.setStart(ed.children[a],0);r.setEnd(ed.children[b],ed.children[b].childNodes.length);getSelection().removeAllRanges();getSelection().addRange(r);ed.focus()}",dict(a=a,b=b))
def input_file(page,spec):
 page.locator('#file').set_input_files(spec)
 page.wait_for_function("document.querySelector('#file').value===''")
def file(page,p):input_file(page,{'name':'作品B.json','mimeType':'application/json','buffer':json.dumps(p,ensure_ascii=False).encode()})
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=shutil.which('chromium'));ctx=browser.new_context(accept_downloads=True,has_touch=True,viewport={'width':1280,'height':900});fonts(ctx);page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto('http://127.0.0.1:'+str(server.server_port));page.evaluate('document.fonts.ready')
  # Controls change text only as explicitly requested, preserving history and target.
  setup(page,'　　　自宅・和室（冬・朝５時・３０歳）\nねこ「こんにちは」\n括弧なし本文');baseline=data(page);select(page,1);page.locator('[data-insert=scene]').click()
  check('scene button inserts one symbol and stores manual provenance',data(page)['chapters'][0]['text'].split('\n')[1]=='◯自宅・和室（冬・朝５時・３０歳）' and data(page)['chapters'][0]['formats'][1]=='scene' and data(page)['chapters'][0]['formatOrigins'][1]=='manual')
  once=data(page);page.locator('[data-insert=scene]').click();check('scene button is idempotent',data(page)==once)
  page.locator('#editor').press('Control+z');check('scene button Undo restores source exactly',data(page)==baseline);page.locator('#editor').press('Control+Shift+z');check('scene Redo restores symbol and style',data(page)==once)
  select(page,2);page.locator('[data-insert=dialogue]').click();check('existing speech and speaker are not double wrapped',data(page)['chapters'][0]['text'].split('\n')[2]=='ねこ「こんにちは」')
  select(page,3);before=data(page);page.locator('[data-insert=dialogue]').click();check('unquoted body wrapped without inventing speaker',data(page)['chapters'][0]['text'].split('\n')[3]=='「括弧なし本文」' and page.evaluate("document.activeElement===$('#editor')"))
  page.locator('#editor').press('Control+z');check('speech Undo exact',data(page)==before);page.locator('#editor').press('Control+Shift+z');styled=data(page);page.reload();check('manual styles and text survive reload',data(page)==styled)
  setup(page,'');select(page,1);page.locator('[data-insert=dialogue]').click();check('empty editing slot becomes editable quote pair',page.evaluate("chapter().text==='#C1\\n「」'&&getSelection().anchorOffset===1"))
  page.keyboard.insert_text('入力');check('typing into quote pair keeps closing delimiter',page.evaluate("chapter().text==='#C1\\n「入力」'"))
  setup(page,'一\n二');select(page,1,2);page.locator('[data-insert=scene]').click();check('batch scene labels each selected paragraph once',data(page)['chapters'][0]['text']=='#C1\n◯一\n◯二');page.locator('#editor').press('Control+z');check('batch scene is one Undo',data(page)['chapters'][0]['text']=='#C1\n一\n二')
  setup(page,'　\n本文');before=data(page);select(page,1,2);page.locator('[data-insert=dialogue]').click();check('batch speech includes a selected whitespace-only paragraph',data(page)['chapters'][0]['text']=='#C1\n「　」\n「本文」');page.locator('#editor').press('Control+z');check('batch empty paragraph speech Undo exact',data(page)==before)
  # Enter / paste / IME / repeated blank separators.
  setup(page);page.evaluate("()=>caretEnd($('#editor').lastElementChild)");page.keyboard.press('Enter');check('one Enter remains same cut',page.evaluate('chapter().cuts.length===1'))
  first_enter=data(page);page.keyboard.press('Enter');second_enter=data(page);page.locator('#editor').press('Control+z');check('Enter boundary Undo restores first Enter',data(page)==first_enter);page.locator('#editor').press('Control+Shift+z');check('Enter boundary Redo preserves ID',data(page)==second_enter);page.keyboard.insert_text('本文B');check('two Enters produce two real cuts',page.evaluate('ScriptModel.realCuts(chapter()).length===2') and '本文B' in data(page)['chapters'][0]['text']);split=data(page);page.reload();check('typed split retains exact IDs on reload',data(page)==split)
  for raw in ['本文A\n\n本文B','本文A\r\n\r\n本文B','本文A\n\n\n\n#C9\n本文B']:
   setup(page,'');before=data(page);page.evaluate("()=>caretEnd($('#editor').lastElementChild)");page.evaluate("text=>{const d=new DataTransfer();d.setData('text/plain',text);$('#editor').dispatchEvent(new ClipboardEvent('paste',{clipboardData:d,bubbles:true,cancelable:true}))}",raw)
   check('pasted blank separators coalesce '+repr(raw),page.evaluate('ScriptModel.realCuts(chapter()).length===2'));after=data(page);page.locator('#editor').press('Control+z');check('pasted split Undo exact '+repr(raw),data(page)==before);page.locator('#editor').press('Control+Shift+z');check('pasted split Redo exact '+repr(raw),data(page)==after)
  setup(page);page.evaluate("()=>{caretEnd($('#editor').lastElementChild);$('#editor').dispatchEvent(new CompositionEvent('compositionstart'))}");page.keyboard.press('Enter');page.evaluate("()=>$('#editor').dispatchEvent(new CompositionEvent('compositionend'))");check('IME confirmation does not split cut',page.evaluate('ScriptModel.realCuts(chapter()).length===1'))
  setup(page);page.evaluate("()=>caretEnd($('#editor').lastElementChild)");page.keyboard.press('Enter');page.keyboard.press('Enter');[page.keyboard.press('Enter') for _ in range(8)];page.keyboard.insert_text('本文B');check('repeated Enters never multiply empty cuts',page.evaluate('chapter().cuts.length===2&&ScriptModel.realCuts(chapter()).length===2'))
  # Normal Open / Save, failures, pending file changes independent of autosave.
  setup(page);A=data(page);B={**A,'title':'作品B'};downloads=[];page.on('download',lambda d:downloads.append(d));file(page,B);check('unmodified file opens with no download or restore dialog',data(page)['title']=='作品B' and not downloads and not page.locator('#dialog').is_visible())
  setup(page);page.evaluate("()=>caretEnd($('#editor').lastElementChild)");page.keyboard.insert_text('追記');page.wait_for_timeout(450);A=data(page);check('autosaved edits still count as unsaved file changes',page.evaluate('!dirty&&FileControls.fileChanged()'));file(page,B);check('opening modified file presents three choices',all(page.locator(s).is_visible() for s in ['#saveAndOpen','#openWithoutSaving','#cancelOpen']))
  page.locator('#cancelOpen').click();check('Open cancellation keeps current project',data(page)==A);file(page,B);page.locator('#openWithoutSaving').click();check('Open without saving never forces download',data(page)['title']=='作品B' and not downloads)
  setup(page);page.evaluate("()=>caretEnd($('#editor').lastElementChild)");page.keyboard.insert_text('未保存');A=data(page);file(page,B);page.evaluate("()=>{window.showSaveFilePicker=async()=>{throw new DOMException('cancel','AbortError')}}");page.locator('#saveAndOpen').click();page.wait_for_timeout(100);check('save picker cancellation cannot discard current project',data(page)==A and page.locator('#dialog').is_visible())
  page.evaluate("()=>{window.showSaveFilePicker=async()=>({createWritable:async()=>({write:async()=>{throw Error('disk full')},close:async()=>{},abort:async()=>{}})})}");page.locator('#saveAndOpen').click();page.wait_for_timeout(100);check('file write failure keeps current project',data(page)==A)
  page.evaluate("()=>{delete window.showSaveFilePicker}");page.locator('#saveAndOpen').click();check('download save cannot open B before confirmation',page.locator('#confirmSavedOpen').is_visible() and data(page)==A);page.locator('#cancelOpen').click();check('download confirmation cancellation keeps A',data(page)==A)
  file(page,B);page.evaluate("()=>{window.showSaveFilePicker=async()=>({createWritable:async()=>({write:async text=>{window.savedFile=text},close:async()=>{}})})}");page.locator('#saveAndOpen').click();page.wait_for_timeout(100);check('confirmed file write saves A then opens B',data(page)['title']=='作品B' and json.loads(page.evaluate('savedFile'))['chapters'][0]['text']==A['chapters'][0]['text'])
  old=data(page);input_file(page,{'name':'bad.json','mimeType':'application/json','buffer':b'{broken'});check('invalid JSON retains current project',data(page)==old)
  check('normal file controls consistently say Save/Open',page.locator('#backup').inner_text()=='保存' and page.locator('#import').inner_text()=='開く')
  setup(page);page.evaluate("()=>caretEnd($('#editor').lastElementChild)");page.keyboard.insert_text('変更');page.evaluate('delete window.showSaveFilePicker');page.locator('#backup').click()
  check('download Save retains pending file changes until confirmation',page.locator('#confirmFileSaved').is_visible() and page.evaluate('FileControls.fileChanged()'));page.locator('#cancelFileSave').click();check('cancelled Save confirmation keeps changes pending',page.evaluate('FileControls.fileChanged()'))
  page.locator('#backup').click();page.locator('#confirmFileSaved').click();check('confirmed download Save marks current file unchanged',not page.evaluate('FileControls.fileChanged()'))
  page.evaluate("()=>caretEnd($('#editor').lastElementChild)");page.keyboard.insert_text('追記');A=data(page);file(page,B)
  page.evaluate("()=>{window.originalSetItem=Storage.prototype.setItem;window.originalCommit=ManuscriptStorage.commit;Storage.prototype.setItem=function(){throw new DOMException('quota','QuotaExceededError')};ManuscriptStorage.commit=async()=>{throw Error('All storage unavailable')}}");page.locator('#openWithoutSaving').click();check('failure of both stores cannot replace current project',data(page)==A);page.evaluate('()=>{Storage.prototype.setItem=originalSetItem;ManuscriptStorage.commit=originalCommit}');page.locator('#close').click()
  # Appearance, focus direction and mobile visual viewport.
  setup(page,'○場所\n人「話す」');check('header app name removed but project name retained',page.locator('header .brand').count()==0 and page.locator('#projectTitle').inner_text()=='動作確認' and page.title()=='おはなし名人')
  check('light background matches provisional offwhite',page.locator('#writing').evaluate("e=>getComputedStyle(e).backgroundColor==='rgb(245, 243, 237)'"))
  page.evaluate("()=>{state.chapters.push(ScriptModel.migrateChapter({id:'two',title:'二章',text:'本文二'}),ScriptModel.migrateChapter({id:'three',title:'三章',text:'本文三'}));render();resetHistory();save()}");page.locator('#focus').click();a=page.locator('#previousChapter').bounding_box();b=page.locator('#nextChapter').bounding_box();check('focus right is previous and left is next',a['x']>b['x'] and page.locator('#previousChapter').is_disabled() and '→' in page.locator('#previousChapter').inner_text() and '←' in page.locator('#nextChapter').inner_text())
  check('focus chrome has no opaque background',page.locator('#focusControls').evaluate("e=>getComputedStyle(e).backgroundColor==='rgba(0, 0, 0, 0)'&&[...e.querySelectorAll('button')].every(b=>getComputedStyle(b).backgroundColor==='rgba(0, 0, 0, 0)')"));page.locator('#nextChapter').click();page.keyboard.press('Alt+PageDown');check('keyboard chapter semantics retain correct endpoints',page.evaluate("active==='three'") and page.locator('#nextChapter').is_disabled());page.keyboard.press('Alt+PageUp');check('previous shortcut still means previous chapter',page.evaluate("active==='two'"));page.screenshot(path=str(OUT/'focus-desktop.png'));page.locator('#exitFocus').click();page.screenshot(path=str(OUT/'normal-desktop.png'))
  old=data(page);page.locator('#menu').click();page.locator('.chapterRow[data-chapter-id=two] .chapterHandle').focus();page.keyboard.press('Space');page.keyboard.press('ArrowDown');page.keyboard.press('Space');ordered=data(page);check('chapter reorder preserves body and IDs while renumbering globally',[c['id'] for c in ordered['chapters']]==['one','three','two'] and {c['id']:[x['id'] for x in c['cuts']] for c in old['chapters']}=={c['id']:[x['id'] for x in c['cuts']] for c in ordered['chapters']} and page.locator('#moveChapterLater').count()==0);page.locator('#closeChapters').click();page.locator('#editor').press('Control+z');check('chapter reorder Undo exact',data(page)==old);page.locator('#editor').press('Control+Shift+z');check('chapter reorder Redo exact',data(page)==ordered)
  page.set_viewport_size({'width':390,'height':844});page.evaluate("()=>{caretEnd($('#editor').lastElementChild);window.r=getSelection().getRangeAt(0).cloneRange();Object.defineProperty(visualViewport,'height',{configurable:true,value:300});visualViewport.dispatchEvent(new Event('resize'))}");page.wait_for_timeout(150)
  bounds=page.locator('#writing').bounding_box();check('keyboard viewport keeps editor and file controls available',bounds['height']>50 and bounds['y']+bounds['height']<=300 and page.locator('#backup').is_visible() and page.locator('#import').is_visible());check('keyboard resize preserves caret identity',page.evaluate('getSelection().anchorNode===r.startContainer&&getSelection().anchorOffset===r.startOffset'));page.screenshot(path=str(OUT/'keyboard-phone.png'))
  page.evaluate("()=>{delete visualViewport.height;visualViewport.dispatchEvent(new Event('resize'))}");page.wait_for_timeout(100);check('closing keyboard restores writing area',page.locator('#writing').bounding_box()['height']>500);page.screenshot(path=str(OUT/'normal-phone.png'))
  if os.environ.get('SOURCE_PROJECT'):
   setup(page);source=pathlib.Path(os.environ['SOURCE_PROJECT']);original=source.read_bytes();input_file(page,str(source));loaded=data(page)
   check('original JSON opens without a forced download',len(loaded['chapters'])==5 and sum(len(c['cuts']) for c in loaded['chapters'])==139)
   for c in loaded['chapters']:
    page.evaluate("id=>{active=id;render();capture();save()}",c['id'])
   stable=data(page)
   for i in range(3):
    page.reload();check('original browser save/reload stable '+str(i+1),data(page)==stable)
   page.evaluate("()=>{showSaveFilePicker=async()=>({createWritable:async()=>({write:async t=>{window.roundtripFile=t},close:async()=>{}})})}");page.locator('#backup').click();page.wait_for_timeout(100)
   saved=json.loads(page.evaluate('roundtripFile'));check('original normal Save retains normalized body IDs and styles',saved==stable)
   input_file(page,{'name':'saved.json','mimeType':'application/json','buffer':json.dumps(saved,ensure_ascii=False).encode()});check('normal saved file reopens idempotently',data(page)==stable)
   check('original attachment bytes untouched',source.read_bytes()==original)
   migration=browser.new_context();fonts(migration);m=migration.new_page();raw=original.decode();m.add_init_script('localStorage.setItem("scenario-meijin-v1",'+json.dumps(raw)+')');m.goto('http://127.0.0.1:'+str(server.server_port));migrated=data(m)
   check('startup migration preserves original raw storage before changing cuts',m.evaluate("localStorage.getItem(KEY+'-before-cut-normalization')")==raw)
   check('startup migration persists canonical IDs once',json.loads(m.evaluate('localStorage.getItem(KEY)'))==migrated)
   second=migration.new_page();second.goto('http://127.0.0.1:'+str(server.server_port));check('second tab reuses migrated cut IDs',data(second)==migrated);migration.close()
  check('no application runtime errors',not errors);browser.close()
finally:server.shutdown();server.server_close()
(OUT/'checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2));print(len(checks),'feedback browser checks passed')
