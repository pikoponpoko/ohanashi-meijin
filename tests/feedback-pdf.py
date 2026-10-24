"""Real selected-font PDFs, normalized private source and centered footers."""
import functools,http.server,json,os,pathlib,re,shutil,threading
import fitz
from playwright.sync_api import sync_playwright
from font_support import fonts
ROOT=pathlib.Path(__file__).resolve().parents[1];OUT=pathlib.Path(os.environ.get('TEST_OUTPUT_DIR','/workspace/ohanashi-feedback-artifacts'));OUT.mkdir(parents=True,exist_ok=True)
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT/'dist')));threading.Thread(target=server.serve_forever,daemon=True).start();checks=[];cover_rasters=[]
def check(name,ok=True):
 assert ok,name
 checks.append(name);print('PASS',name,flush=True)
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=shutil.which('chromium'));ctx=browser.new_context(accept_downloads=True);fonts(ctx);page=ctx.new_page();page.goto('http://127.0.0.1:'+str(server.server_port));page.evaluate('document.fonts.ready');cdp=ctx.new_cdp_session(page);cdp.send('DOM.enable');cdp.send('CSS.enable')
  for font in ([] if os.environ.get('PDF_SOURCE_ONLY') else ['Noto Serif JP','Noto Sans JP','Zen Old Mincho']):
   page.evaluate("font=>{state=validate({...initial,font,title:'長い作品名の組版確認'.repeat(12),author:'著者名',cover:true,chapters:[{id:'one',title:'長い章名'.repeat(40),text:'○場所\\n人「本文と表紙の書体を確認する。」\\n#C2\\n'}]});active='one';render();resetHistory();save()}",font)
   before=page.evaluate('JSON.stringify(state)')
   with page.expect_download(timeout=180000) as d:page.evaluate('()=>printProject(true)')
   path=OUT/(font.replace(' ','-')+'-cover-proof.pdf');d.value.save_as(path);pdf=fitz.open(path);pdf[0].get_pixmap(matrix=fitz.Matrix(1,1)).save(str(path.with_suffix('.png')));cover_rasters.append(path.with_suffix('.png').read_bytes())
   page.evaluate("$('#printRoot').classList.add('pdf-render')");root=cdp.send('DOM.getDocument')['root']['nodeId'];used=[]
   for selector in ['.cover h1','.cover p','.printbody p']:
    node=cdp.send('DOM.querySelector',{'nodeId':root,'selector':selector})['nodeId'];f=cdp.send('CSS.getPlatformFontsForNode',{'nodeId':node})['fonts'];used.extend(f)
    check('cover and body really render selected font '+font+' '+selector,bool(f) and all(x['familyName'].startswith(font) and x['isCustomFont'] for x in f))
   check('long cover fits page '+font,page.locator('.cover').evaluate('e=>e.scrollHeight<=e.clientHeight+1'))
   check('PDF footer chapter center stable with long metadata '+font,page.locator('.printfoot').evaluate("e=>{const a=e.getBoundingClientRect(),b=e.children[1].getBoundingClientRect();return Math.abs((a.left+a.right)/2-(b.left+b.right)/2)<1&&[...e.children].every(x=>x.scrollHeight<=x.clientHeight+1||getComputedStyle(x).overflow==='hidden')}"))
   check('PDF keeps white paper '+font,page.locator('.printpage').first.evaluate("e=>getComputedStyle(e).backgroundColor==='rgb(255, 255, 255)'"))
   check('PDF rendering leaves manuscript unchanged '+font,page.evaluate('JSON.stringify(state)')==before and len(pdf)>=2);pdf.close();page.evaluate("$('#printRoot').classList.remove('pdf-render')")
  if cover_rasters:check('exported cover pixels actually differ across three selected fonts',len(set(cover_rasters))==3)
  if os.environ.get('SOURCE_PROJECT'):
   original=json.loads(pathlib.Path(os.environ['SOURCE_PROJECT']).read_text());page.evaluate("v=>{state=validate(v);active=state.chapters[0].id;render();resetHistory();save()}",original);copy=page.evaluate('JSON.parse(JSON.stringify(state))');(OUT/'アニメーション作家のねこちゃん_修正確認用.json').write_text(json.dumps(copy,ensure_ascii=False,indent=2))
   with page.expect_download(timeout=240000) as d:page.evaluate('()=>printProject(true)')
   path=OUT/'アニメーション作家のねこちゃん_修正確認用.pdf';d.value.save_as(path);pdf=fitz.open(path);print('PRIVATE SOURCE PDF pages',len(pdf),flush=True);pdf[0].get_pixmap().save(str(OUT/'修正後PDF_表紙.png'));pdf[1].get_pixmap().save(str(OUT/'修正後PDF_本文.png'))
   page.evaluate("$('#printRoot').classList.add('pdf-render')");paras=page.locator('.printbody p').all_text_contents();labels=page.locator('.printbody p[data-cut-id]').all_text_contents()
   check('original PDF has exactly 139 sequential real cut numbers',labels==['#C'+str(i) for i in range(1,140)])
   expected=''.join(re.sub(r'\s','',s) for c in copy['chapters'] for i,s in enumerate(c['text'].split('\n')) if not any(x['line']==i for x in c['cuts']));actual=''.join(re.sub(r'\s','',s) for s in page.locator('.printbody p:not([data-cut-id])').all_text_contents())
   check('all original non-marker body text survives PDF pagination',actual==expected)
   check('all chapter footers geometrically centered',page.locator('.printfoot').evaluate_all("es=>es.every(e=>{const a=e.getBoundingClientRect(),b=e.children[1].getBoundingClientRect();return Math.abs((a.left+a.right)/2-(b.left+b.right)/2)<1})"))
   check('no empty extra pages',page.locator('.printbody').evaluate_all("es=>es.every(e=>[...e.children].some(p=>p.textContent.trim()&&!/^#C\\d+$/.test(p.textContent)))"));pdf.close()
  browser.close()
finally:server.shutdown();server.server_close()
(OUT/'pdf-checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2));print(len(checks),'PDF checks passed')
