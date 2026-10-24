"""Use actual fonts locally in browser tests; no changes to application assets."""
import functools,http.server,pathlib,threading
FONT_ROOT=pathlib.Path('/tmp/ohanashi-font-tests/node_modules/@fontsource')
class FontHandler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
 def end_headers(self):self.send_header('Access-Control-Allow-Origin','*');super().end_headers()
server=None
if FONT_ROOT.exists():
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(FontHandler,directory=str(FONT_ROOT)))
 threading.Thread(target=server.serve_forever,daemon=True).start()
 css='\n'.join((FONT_ROOT/p/'400.css').read_text().replace('url(./files/',f'url(http://127.0.0.1:{server.server_port}/{p}/files/') for p in ['noto-serif-jp','noto-sans-jp','zen-old-mincho'])
def fonts(context):
 if not server:raise RuntimeError('Install Fontsource test fonts as documented in docs/FORMATTING_LAYOUT_REVIEW.md')
 context.route('https://fonts.googleapis.com/**',lambda r:r.fulfill(content_type='text/css',headers={'Access-Control-Allow-Origin':'*'},body=css))
