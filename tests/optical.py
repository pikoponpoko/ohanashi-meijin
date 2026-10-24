"""Optical comparison with real locally-installed test fonts, never fallback fonts."""
import functools,http.server,json,os,pathlib,re,shutil,threading
import fitz
from PIL import Image
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1];FONTS=pathlib.Path(os.environ.get('FONT_TEST_ROOT','/tmp/ohanashi-font-tests/node_modules/@fontsource'))
OUT=pathlib.Path(os.environ.get('TEST_OUTPUT_DIR','/tmp/ohanashi-optical-final'));OUT.mkdir(parents=True,exist_ok=True)
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
 def end_headers(self):self.send_header('Access-Control-Allow-Origin','*');super().end_headers()
servers=[]
def serve(path):
 s=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(path)));threading.Thread(target=s.serve_forever,daemon=True).start();servers.append(s);return 'http://127.0.0.1:'+str(s.server_port)
fontbase=serve(FONTS);base=serve(ROOT/'dist');rows=[];checks=[]
def check(name,ok):
 assert ok,name
 checks.append(name);print('PASS',name,flush=True)
packages=['noto-serif-jp','noto-sans-jp','zen-old-mincho'];names=['Noto Serif JP','Noto Sans JP','Zen Old Mincho']
css='\n'.join((FONTS/p/'400.css').read_text().replace('url(./files/',f'url({fontbase}/{p}/files/') for p in packages)
versions={p:json.loads((FONTS/p/'package.json').read_text())['version'] for p in packages}
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium'))
  page=browser.new_page(viewport={'width':1000,'height':700},device_scale_factor=3)
  page.route('https://fonts.googleapis.com/**',lambda r:r.fulfill(content_type='text/css',headers={'Access-Control-Allow-Origin':'*'},body=css));page.goto(base);page.evaluate('document.fonts.ready')
  markup=page.evaluate("Object.fromEntries(['12','１２','！','？'].map(s=>[s,markup(s)]))")
  styles=(ROOT/'dist/style.css').read_text()
  page.set_content('<style>'+css+'\n'+styles+'''\nbody{display:block;background:white;color:black;height:auto;overflow:auto}#editor{padding:0;width:auto;height:auto;writing-mode:horizontal-tb;background:white;color:black;overflow:visible}.probe{writing-mode:vertical-rl;font-family:var(--test-font);font-size:var(--test-size);font-feature-settings:'palt';letter-spacing:.04em;line-height:1.65;width:80px;height:180px;padding:10px;display:inline-block;vertical-align:top}#editor .probe.before .verticalGlyph{font-feature-settings:'palt'} </style><div id=editor></div>''')
  for font in names:
   for size in [14,19,28]:
    for glyph in ['12','１２','！','？']:
     page.evaluate("""({font,size,html})=>{$('#editor').innerHTML=['before','after'].map(mode=>`<div class="probe ${mode}" style="--test-size:${size}px;--test-font:'${font}'">漢${html}漢</div>`).join('')}""",dict(font=font,size=size,html=markup[glyph]))
     page.evaluate("font=>document.fonts.load('28px \"'+font+'\"','漢１２！？12')",font);page.evaluate('document.fonts.ready');check('actual font loaded '+font+' '+str(size)+' '+glyph,page.evaluate("font=>document.fonts.check('28px \"'+font+'\"','漢１２！？12')",font))
     values=[]
     for i in [0,1]:
      box=page.locator('.probe span').nth(i).bounding_box();file=OUT/'measurement.png';page.screenshot(path=str(file),clip=box)
      im=Image.open(file).convert('RGB');weights=[sum(255-min(im.getpixel((x,y))) for y in range(im.height)) for x in range(im.width)]
      center=sum(x*w for x,w in enumerate(weights))/sum(weights);values.append((center-(im.width-1)/2)/3)
     check('centering improves or remains unchanged '+font+' '+str(size)+' '+glyph,abs(values[1])<=abs(values[0])+.2)
     rows.append(dict(font=font,size=size,glyph=glyph,before=values[0],after=values[1]))
     if size==28:page.locator('#editor').screenshot(path=str(OUT/(font.replace(' ','-')+'-'+str(ord(glyph[0]))+'.png')))
  page.evaluate("$('#editor').classList.add('horizontal')")
  check('horizontal glyph features remain unchanged',page.locator('.probe span').nth(1).evaluate("e=>getComputedStyle(e).fontFeatureSettings.includes('palt')&&!getComputedStyle(e).fontFeatureSettings.includes('0')"))
  printed=browser.new_page()
  printed.route('https://fonts.googleapis.com/**',lambda r:r.fulfill(content_type='text/css',headers={'Access-Control-Allow-Origin':'*'},body=css));printed.goto(base)
  for font in names:
   printed.evaluate("font=>{state=validate({...initial,font,cover:false,chapters:[{id:'proof',title:'組版確認',text:'○場\\n　　　漢12漢１２漢！漢？漢\\n人「字形を確認する。」'}]});active='proof';render();resetHistory();save()}",font)
   printed.evaluate("font=>document.fonts.load('16px \"'+font+'\"','漢１２！？12')",font)
   snapshot=printed.evaluate('JSON.stringify(state)')
   with printed.expect_download() as download:printed.evaluate('()=>printProject(true)')
   file=OUT/(font.replace(' ','-')+'-print.pdf');download.value.save_as(file)
   pdf=fitz.open(file);pdf[0].get_pixmap().save(str(file.with_suffix('.png')))
   check('actual font PDF has a rendered page and source unchanged '+font,len(pdf)==1 and bool(pdf[0].get_images()) and printed.evaluate('JSON.stringify(state)')==snapshot)
   check('print uses scoped fullwidth glyph correction '+font,printed.locator('.printbody .verticalGlyph').first.evaluate("e=>getComputedStyle(e).fontFeatureSettings.includes('\\\"palt\\\" 0')"))
   pdf.close()
  browser.close()
finally:
 for s in servers:s.shutdown();s.server_close()
(OUT/'measurements.json').write_text(json.dumps({'fontPackages':versions,'measurements':rows},ensure_ascii=False,indent=2))
print(len(checks),'optical checks passed (Chromium only; Safari not tested)')
