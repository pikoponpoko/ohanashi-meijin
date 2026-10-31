// Moving this browser's data from the old URL to the new one (dist/migrate-core.js).
// Two local origins stand in for the two URLs: OLD first serves the app (to make real saved data),
// then the legacy migration page; NEW serves the app with migrate.html.
//   node tests/migration-browser.cjs
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '../dist');
const LEGACY = path.resolve(process.env.LEGACY_DIR || path.resolve(__dirname, '../legacy/public'));

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.woff2': 'font/woff2' };
function server(port, rootOf) {
  return new Promise((res) => {
    const s = http.createServer((req, rsp) => {
      const dir = rootOf();
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      let f = path.join(dir, p);
      if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dir, 'index.html');
      rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(f).pipe(rsp);
    }).listen(port, '127.0.0.1', () => res(s));
  });
}
let failed = 0;
const MAIN_CORE = path.join(ROOT, 'migrate-core.js');
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!ok) failed++; };
// a summary of everything this origin keeps: [db/store/key] -> size, and localStorage
const DUMP = `async () => {
  const out = { idb: {}, ls: {} };
  for (const { name } of await indexedDB.databases()) {
    const db = await new Promise((r) => { const q = indexedDB.open(name); q.onsuccess = () => r(q.result); });
    for (const s of db.objectStoreNames) {
      const all = await new Promise((r) => { const out = []; const c = db.transaction(s).objectStore(s).openCursor(); c.onsuccess = () => { const x = c.result; if (!x) return r(out); out.push([x.primaryKey, x.value]); x.continue(); }; });
      for (const [k, v] of all) {
        const size = async (v) => v instanceof Blob ? 'blob:' + v.size + ':' + v.type : v instanceof ArrayBuffer ? 'ab:' + v.byteLength : ArrayBuffer.isView(v) ? 'view:' + v.byteLength
          : v && typeof v === 'object' ? JSON.stringify(await Promise.all(Object.entries(v).map(async ([a, b]) => [a, await size(b)]))) : JSON.stringify(v);
        out.idb[name + '/' + s + '/' + JSON.stringify(k)] = (await size(v)).slice(0, 400) + '#v' + db.version;
      }
    }
    db.close();
  }
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k !== 'migration.done') out.ls[k] = localStorage.getItem(k); }
  return out;
}`;

(async () => {
  check('the old and new pages use the same migrate-core.js', fs.readFileSync(MAIN_CORE, 'utf8') === fs.readFileSync(path.join(LEGACY, 'migrate-core.js'), 'utf8'));
  let oldRoot = ROOT;
  const sOld = await server(8761, () => oldRoot), sNew = await server(8762, () => ROOT);
  const OLD = 'http://127.0.0.1:8761', NEW = 'http://127.0.0.1:8762';
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  ctx.on('page', (p) => p.on('pageerror', (e) => errors.push(e.message)));
  try {
    // 1) the old URL in use: a manuscript (with archives), appearance, cloud base and session
    const a = await ctx.newPage();
    await ctx.route('https://fonts.googleapis.com/**', (r) => r.abort());
    a.on('pageerror', (e) => errors.push(e.message));
    await a.goto(OLD + '/'); await a.waitForSelector('#editor');
    await a.evaluate(() => { state = validate({ ...initial, title: '移行する原稿', chapters: [{ id: 'm1', title: '第一章', text: '○部屋\n人「移行テスト」' }] }); active = 'm1'; render(); save(); });
    await a.waitForTimeout(800);
    await a.evaluate(async () => {
      localStorage.setItem('togaki.cloud.session', JSON.stringify({ token: 't-123', user: { email: 'x@example.com' } }));
      const db = await new Promise((r) => { const q = indexedDB.open('togaki-cloud-v1', 1); q.onupgradeneeded = () => q.result.createObjectStore('bases', { keyPath: 'id' }); q.onsuccess = () => r(q.result); });
      await new Promise((r) => { const tx = db.transaction('bases', 'readwrite'); tx.objectStore('bases').put({ id: 'w1', revision: 3, body: { chapters: [] } }); tx.oncomplete = r; });
      const db2 = await new Promise((r) => { const q = indexedDB.open('ohanashi-appearance-v1', 1); q.onupgradeneeded = () => q.result.createObjectStore('files'); q.onsuccess = () => r(q.result); });
      await new Promise((r) => { const tx = db2.transaction('files', 'readwrite'); tx.objectStore('files').put(new Blob([new Uint8Array(300000)], { type: 'image/png' }), 'background'); tx.oncomplete = r; });
    });
    const title = '移行する原稿';
    const before = await a.evaluate(`(${DUMP})()`);
    check('old URL has saved data', Object.keys(before.ls).some((k) => k.startsWith('scenario-meijin-v1')) && Object.keys(before.idb).length >= 2, Object.keys(before.idb).length + ' records, ' + Object.keys(before.ls).length + ' keys');

    // 2) the old URL now serves the migration page
    oldRoot = LEGACY;
    await a.goto(OLD + '/?to=' + encodeURIComponent(NEW));
    await a.waitForSelector('#page:not([hidden])');
    check('migration page shows the new URL', (await a.textContent('#newUrl')) === NEW.replace(/^https?:\/\//, ''));
    const [pop] = await Promise.all([a.waitForEvent('popup'), a.click('#go')]);
    await a.waitForFunction(() => /移行しました|できません/.test(document.getElementById('msg').textContent), null, { timeout: 120000 });
    check('old page reports done', /移行しました/.test(await a.textContent('#msg')), await a.textContent('#msg'));
    await pop.waitForFunction(() => /移行しました|できません/.test(document.getElementById('msg').textContent), null, { timeout: 30000 });
    check('new page reports done', /移行しました/.test(await pop.textContent('#msg')), await pop.textContent('#msg'));

    // 3) the new URL holds the same data, and the app picks the work up
    const after = await pop.evaluate(`(${DUMP})()`);
    const missing = Object.keys(before.idb).filter((k) => after.idb[k] !== before.idb[k]);
    check('every IndexedDB record arrived unchanged', missing.length === 0, missing.slice(0, 3).join(', '));
    const lsDiff = Object.keys(before.ls).filter((k) => after.ls[k] !== before.ls[k]);
    check('every setting arrived unchanged', lsDiff.length === 0, lsDiff.join(', '));
    const oldStill = await a.evaluate(`(${DUMP})()`);
    check('old URL data is left in place', Object.keys(before.idb).every((k) => oldStill.idb[k] === before.idb[k]));
    await pop.goto(NEW + '/'); await pop.waitForSelector('#editor'); await pop.waitForTimeout(800);
    const resumed = await pop.evaluate(() => ({ title: state.title, text: document.getElementById('editor').textContent }));
    check('the app on the new URL opens the same manuscript', resumed.title === title && resumed.text.includes('移行テスト'), JSON.stringify(resumed).slice(0, 120));
    check('settings are in effect on the new URL', (await pop.evaluate(() => localStorage.getItem('togaki.cloud.session'))).includes('t-123'));

    // 4) once moved, the old URL forwards (path and query kept); ?migrate shows the page again
    const b = await ctx.newPage();
    await b.goto(OLD + '/recovery?x=1&to=' + encodeURIComponent(NEW));
    await b.waitForURL(NEW + '/recovery?x=1', { timeout: 10000 }).catch(() => {});
    check('old URL forwards after the move', b.url() === NEW + '/recovery?x=1', b.url());
    await b.goto(OLD + '/?migrate&to=' + encodeURIComponent(NEW)); await b.waitForSelector('#page:not([hidden])');
    check('?migrate shows the page again', true);

    // 5) moving again onto a URL that already has data asks first
    const [pop2] = await Promise.all([b.waitForEvent('popup'), b.click('#go')]);
    await pop2.waitForSelector('#ask:not([hidden])', { timeout: 30000 });
    check('a second move asks before overwriting', true);
    await pop2.click('#no');
    await b.waitForFunction(() => /やめました/.test(document.getElementById('msg').textContent));
    check('declining leaves both sides as they were', true);

    // 6) a fresh browser with nothing saved at the old URL goes straight to the new one
    const c2 = await browser.newContext(); await c2.route('https://fonts.googleapis.com/**', (r) => r.abort()); const c = await c2.newPage();
    await c.goto(OLD + '/?to=' + encodeURIComponent(NEW));
    await c.waitForURL(NEW + '/', { timeout: 10000 }).catch(() => {});
    check('empty old URL forwards at once', c.url() === NEW + '/', c.url());
    check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  } finally {
    await browser.close(); sOld.close(); sNew.close();
  }
  console.log(failed ? `${failed} FAILED` : 'ALL PASS');
  process.exit(failed ? 1 : 0);
})();
