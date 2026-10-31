"""Cloud script sync between Togaki and プリプロ名人 against the real Worker (プリプロ名人 worker/index.js) on a local D1.

  PREPRO_DIR=/path/to/prepro-meijin WRANGLER=/path/to/wrangler python tests/cloud-browser.py

プリプロ名人 registers a work; Togaki opens it from the cloud list, edits go both ways by themselves, a line changed
on both sides waits for a choice, a manuscript opened from a file is not sent without asking, device settings stay,
stop on this device, delete from the cloud keeps the manuscript."""
import http.server, json, os, shutil, socket, socketserver, subprocess, sys, tempfile, threading, time, urllib.request
from functools import partial
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
PREPRO = Path(os.environ.get('PREPRO_DIR') or ROOT.parent / 'prepro-meijin').resolve()
WORK = Path(os.environ.get('PREPRO_WORK') or PREPRO / 'dev/tests/demo.vconte')
fails = []
def ok(v, s):
  print(('PASS ' if v else 'FAIL ') + s)
  if not v: fails.append(s)
def port():
  s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p

P, Q = port(), port()
db = tempfile.mkdtemp()
wrangler = os.environ.get('WRANGLER') or shutil.which('wrangler') or 'npx wrangler'
proc = subprocess.Popen(f'{wrangler} dev -c cloud-wrangler.jsonc --ip 127.0.0.1 --port {P} --persist-to {db}', shell=True,
  cwd=PREPRO / 'dev/tests', stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
API = f'http://127.0.0.1:{P}'
for _ in range(120):
  try: urllib.request.urlopen(API + '/api/cloud/config', timeout=2); break
  except Exception: time.sleep(0.5)
class Quiet(http.server.SimpleHTTPRequestHandler):
  def log_message(self, *a): pass
server = socketserver.ThreadingTCPServer(('127.0.0.1', Q), partial(Quiet, directory=str(ROOT / 'dist')))
threading.Thread(target=server.serve_forever, daemon=True).start()
TOGAKI = f'http://127.0.0.1:{Q}'
user = 'u' + str(int(time.time() * 1000))
token = json.loads(urllib.request.urlopen(urllib.request.Request(API + '/api/cloud/login', data=json.dumps({'testUser': user}).encode(), method='POST')).read())

def prepro(browser):
  page = browser.new_context(viewport={'width': 1400, 'height': 900}).new_page(); page.on('pageerror', lambda e: print('prepro pageerror', e))
  page.goto(API + '/?new=1'); page.wait_for_function('window.app && app.p')
  page.evaluate('document.querySelectorAll(".modal-back").forEach(m=>m.remove())')
  page.evaluate('t => localStorage.setItem("vconte.cloud.session", JSON.stringify({token: t.token, user: t.user}))', token)
  page.evaluate('() => { const i = document.createElement("input"); i.type = "file"; i.id = "__f"; document.body.append(i); }')
  page.set_input_files('#__f', str(WORK))
  page.evaluate('async () => { const f = document.getElementById("__f"); await app.loadBlob(f.files[0]); f.remove(); }')
  return page
C = "const C = await import('/js/cloud.js');"
def pcall(page, js, arg=None): return page.evaluate('async (arg) => { ' + C + js + ' }', arg)
def pline(page, i): return page.evaluate('i => app.p.dialogues.filter(d => d.kind === "normal" && d.text)[i].text', i)
def pedit(page, i, text): page.evaluate('([i, t]) => app.edit(p => { p.dialogues.filter(d => d.kind === "normal" && d.text)[i].text = t; })', [i, text])
def togaki(browser):
  ctx = browser.new_context(viewport={'width': 1280, 'height': 860}, accept_downloads=True)
  ctx.add_init_script(f'localStorage.setItem("togaki.cloud.api", {json.dumps(API)})')
  page = ctx.new_page(); page.on('pageerror', lambda e: print('togaki pageerror', e))
  page.goto(TOGAKI + '/'); page.wait_for_function('window.CloudSync && !document.querySelector("main").inert')
  return page
def tsync(page, auto=True):
  return page.evaluate('async a => { try { return await CloudSync.syncNow({auto: a}); } catch (e) { return {error: e.code}; } }', auto)
def has(page, s): return page.evaluate('s => state.chapters.some(c => c.text.includes(s))', s)
def tedit(page, old, new):
  # an edit as the editor makes it: the text changes, the screen follows, autosave and undo record it
  return page.evaluate('''([o, n]) => { const c = state.chapters.find(c => c.text.includes(o)); if (!c) return false;
    c.text = c.text.replace(o, n); state = validate(state); render(); changed(); return true; }''', [old, new])
def dialog_text(page): return page.evaluate('document.querySelector("#dialog").open ? document.querySelector("#dialogBody").innerText : ""')
def click(page, label): page.locator('#dialogBody button', has_text=label).first.click()

try:
  with sync_playwright() as pw:
    exe = os.environ.get('CHROMIUM_PATH') or shutil.which('chromium') or shutil.which('chromium-browser')
    browser = pw.chromium.launch(**({'executable_path': exe} if exe else {}))
    a = prepro(browser)
    pcall(a, 'await C.register(app);')
    id = a.evaluate('app.p.cloudLink.id')
    ok(bool(id), f'プリプロ名人 registers the work ({id})')

    t = togaki(browser)
    ok(t.locator('#cloud svg').count() == 1 and t.locator('#cloud').inner_text() == '' and t.get_attribute('#cloud', 'aria-label') == 'クラウド同期', 'the cloud button is an icon in the footer')
    # Google's sign-in script stands in for itself here (no Google in tests)
    t.route('https://accounts.google.com/gsi/client', lambda r: r.fulfill(content_type='text/javascript', body='window.google={accounts:{oauth2:{initTokenClient:()=>({requestAccessToken(){}})}}}'))
    t.click('#cloud'); t.wait_for_timeout(500)
    ok('Googleでログイン' in dialog_text(t), 'signed out: the dialog offers the Google sign-in only')
    t.evaluate('document.querySelector("#dialog").close()')
    t.evaluate('t => localStorage.setItem("togaki.cloud.session", JSON.stringify({token: t.token, user: t.user}))', token)
    before = t.evaluate('JSON.stringify(state)')
    t.click('#cloud'); t.wait_for_timeout(500)
    ok('この作品をクラウドに登録' in dialog_text(t) and user in dialog_text(t), 'signed in: register, open from the cloud or by code')
    click(t, 'クラウドの作品を開く'); t.wait_for_timeout(300)
    t.locator('#dialogBody .archiveOpen').first.click()
    t.wait_for_function('state.cloudLinkId', timeout=10000)
    ok(t.evaluate('state.cloudLinkId') == id, 'Togaki opens the cloud work with the same link ID')
    t.locator('#dialogBody button', has_text='今すぐ同期').wait_for()
    ok('同期 ' in dialog_text(t) and '・r1' in dialog_text(t), 'the dialog comes back with the sync state and the cloud revision')
    t.screenshot(path=str(Path(os.environ.get('TEST_OUTPUT_DIR', tempfile.gettempdir())) / 'cloud-dialog.png'))
    t.evaluate('document.querySelector("#dialog").close()')
    ok(t.evaluate('b => archivedDocuments().some(d => d.raw === b)', before), 'the manuscript open before went to 保存した原稿')
    ok(has(t, pline(a, 0)) and has(t, pline(a, 1)), 'the lines of プリプロ名人 are in the manuscript')
    t.evaluate('() => { state.font = "Noto Sans JP"; state.direction = "horizontal"; render(); changed(); }')
    t.wait_for_timeout(600)
    r = tsync(t)
    ok(r.get('sent') is False, f'nothing to send right after opening; device settings are not part of the script ({r})')

    # Togaki edit -> プリプロ名人
    l0 = pline(a, 0)
    ok(tedit(t, l0, l0 + '（Togakiで追記）'), 'Togaki edits a line')
    r = tsync(t)
    ok(r.get('sent'), f'the edit goes up ({r})')
    r = pcall(a, 'return await C.syncNow(app, {auto: true});')
    ok(pline(a, 0) == l0 + '（Togakiで追記）', f'プリプロ名人 takes it by itself ({r})')

    # プリプロ名人 edit -> Togaki
    l1 = pline(a, 1)
    pedit(a, 1, 'プリプロ名人で直した台詞')
    r = pcall(a, 'return await C.syncNow(app);')
    ok(r.get('sent'), 'プリプロ名人 sends its edit')
    undo_len = t.evaluate('history.length')
    r = tsync(t)
    ok(has(t, 'プリプロ名人で直した台詞') and not has(t, l1), f'Togaki takes it by itself ({r})')
    ok(has(t, l0 + '（Togakiで追記）'), 'and keeps its own edit')
    ok('プリプロ名人で直した台詞' in t.inner_text('#editor'), 'the screen shows it')
    ok(t.evaluate('[state.font, state.direction]') == ['Noto Sans JP', 'horizontal'], 'device settings stay')
    ok(t.evaluate('history.length') > undo_len, 'the incoming change can be undone')
    t.wait_for_timeout(600)
    ok(t.evaluate('JSON.parse(localStorage.getItem("scenario-meijin-v1") || "null")?.chapters?.some(c => c.text.includes("プリプロ名人で直した台詞")) || ManuscriptStorage.usingDatabase'), 'and is saved in the browser')
    r = pcall(a, 'return await C.syncNow(app, {auto: true});')
    ok(r.get('sent') is False, f'no echo back from プリプロ名人 ({r})')

    # both sides change the same line
    l2 = pline(a, 2)
    pedit(a, 2, 'プリプロ側の変更'); pcall(a, 'return await C.syncNow(app);')
    tedit(t, l2, 'Togaki側の変更')
    r = tsync(t)
    ok(r.get('review') and has(t, 'Togaki側の変更'), f'Togaki waits for a choice and keeps its own text ({r})')
    t.wait_for_timeout(100)
    ok(t.locator('#cloud').inner_text() == '確認待ち', 'the button says a check is waiting')
    t.click('#cloud'); t.wait_for_timeout(300)
    click(t, '今すぐ同期'); t.wait_for_selector('#cloudConflicts .cloudConflict')
    conflict = t.evaluate('document.querySelector("#cloudConflicts").innerText')
    ok('プリプロ側の変更' in conflict and 'Togaki側の変更' in conflict, 'the conflict shows both versions')
    t.screenshot(path=str(Path(os.environ.get('TEST_OUTPUT_DIR', tempfile.gettempdir())) / 'cloud-conflict.png'))
    t.select_option('#cloudConflicts select', 'cloud'); t.click('#cloudApplyChoice')
    t.wait_for_function('state.chapters.some(c => c.text.includes("プリプロ側の変更"))', timeout=10000)
    ok(t.evaluate('archivedDocuments().some(d => d.raw.includes("Togaki側の変更"))'), 'taking the cloud: the manuscript before is in 保存した原稿')
    ok(t.evaluate('state.cloudLinkId') == id, 'link kept')

    # a manuscript opened from a file is not sent without asking
    old = t.evaluate('JSON.stringify({...state, chapters: state.chapters.map(c => ({...c, text: c.text.replace("プリプロ側の変更", "古いファイルの台詞")}))})')
    path = Path(db) / 'old.json'; path.write_text(old, encoding='utf-8')
    t.set_input_files('#file', str(path)); t.wait_for_timeout(300)
    if t.locator('#openWithoutSaving').count(): t.click('#openWithoutSaving')
    t.wait_for_function('state.chapters.some(c => c.text.includes("古いファイルの台詞"))', timeout=10000)
    r = tsync(t)
    w = pcall(a, 'return await C.api("/works/" + arg);', id)
    ok(r.get('review') and '古いファイルの台詞' not in json.dumps(w['body'], ensure_ascii=False), f'an opened file waits for the user before going up ({r})')
    t.click('#cloud'); t.wait_for_timeout(300)
    ok('開いた原稿がクラウドと違います' in dialog_text(t), 'and the dialog says so')
    t.evaluate('document.querySelector("#dialog").close()')

    # stop on this device; delete from the cloud keeps the manuscript
    t.evaluate('id => { const all = JSON.parse(localStorage.getItem("togaki.cloud.links")); all[id].on = false; all[id].review = null; localStorage.setItem("togaki.cloud.links", JSON.stringify(all)); }', id)
    r = tsync(t)
    ok(r.get('skipped'), 'stopped on this device: nothing syncs')
    t.evaluate('id => { const all = JSON.parse(localStorage.getItem("togaki.cloud.links")); all[id].on = true; localStorage.setItem("togaki.cloud.links", JSON.stringify(all)); }', id)
    pcall(a, 'await C.api("/works/" + arg, {method: "DELETE"});', id)
    mine = t.evaluate('JSON.stringify(state.chapters)')
    r = tsync(t)
    st = t.evaluate('id => JSON.parse(localStorage.getItem("togaki.cloud.links"))[id]', id)
    ok(r.get('error') == 'deleted' and not st['on'] and st.get('deleted'), f'a deleted work stops syncing ({r})')
    ok(t.evaluate('JSON.stringify(state.chapters)') == mine, 'and the manuscript stays as it was')
    w = pcall(a, 'try { return await C.api("/works/" + arg); } catch (e) { return {status: e.status}; }', id)
    ok(w.get('status') == 410, 'nothing was uploaded again')
    t.click('#cloud'); t.wait_for_timeout(300)
    ok('クラウドに再登録' in dialog_text(t), 'the dialog offers registering again')
    click(t, 'クラウドに再登録'); t.wait_for_timeout(800)
    w = pcall(a, 'return await C.api("/works/" + arg);', id)
    ok(w.get('app') == 'ohanashi' and '古いファイルの台詞' in json.dumps(w['body'], ensure_ascii=False), 'registering again is an explicit step and keeps the link ID')

    # a new manuscript registered from Togaki shows up for プリプロ名人
    t.evaluate('document.querySelector("#dialog").close()')
    t.click('#newDocument'); t.click('#confirmNewDocument'); t.wait_for_timeout(300)
    t.evaluate('() => { state.title = "Togakiの新作"; state.chapters[0].text = "#C1\\nねこ「はじめまして」"; state.chapters[0].cuts = [{id: crypto.randomUUID(), line: 0}]; delete state.chapters[0].formats; delete state.chapters[0].formatOrigins; state = validate(state); render(); changed(); }')
    t.click('#cloud'); t.wait_for_timeout(300); click(t, 'この作品をクラウドに登録'); t.wait_for_timeout(800)
    nid = t.evaluate('state.cloudLinkId')
    works = pcall(a, 'return (await C.api("/works")).works.map(w => w.id);')
    ok(bool(nid) and nid in works, 'a work registered in Togaki is listed for プリプロ名人')
    w = pcall(a, 'return await C.api("/works/" + arg);', nid)
    click(t, 'クラウドの作品を開く'); t.wait_for_timeout(500)
    ok(t.locator('#dialogBody .archiveOpen').count() == 2, 'with a work linked here, the other cloud works can still be opened')
    t.evaluate('document.querySelector("#dialog").close()')
    ok(w['body'].get('cloudLinkId') == nid and 'ねこ「はじめまして」' in w['body']['chapters'][0]['text'], 'its script is a v2 JSON carrying the link ID')
    browser.close()
finally:
  os.killpg(proc.pid, 15); server.shutdown()
  shutil.rmtree(db, ignore_errors=True)
print('ALL PASS' if not fails else f'{len(fails)} FAILED')
sys.exit(1 if fails else 0)
