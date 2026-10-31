// Moves this browser's saved data (IndexedDB + localStorage) from the old URL to the new one.
// The old page (legacy branch) sends; the new page (migrate.html) receives. Nothing is deleted on either side.
// The same file is used by Soku Conte and Togaki.
(() => {
  'use strict';
  const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
  const DONE_KEY = 'migration.done';

  const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const txDone = (tx) => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = tx.onabort = () => rej(tx.error || Error('保存が中断されました')); });

  // File handles cannot cross origins: drop array entries / properties that hold one.
  const isHandle = (v) => typeof FileSystemHandle !== 'undefined' && v instanceof FileSystemHandle;
  const isPlain = (v) => v && typeof v === 'object' && (Array.isArray(v) || Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
  function hasHandle(v, depth = 0) {
    if (isHandle(v)) return true;
    if (!isPlain(v) || depth > 40) return false;
    for (const k of Object.keys(v)) if (hasHandle(v[k], depth + 1)) return true;
    return false;
  }
  function stripHandles(v, depth = 0) {
    if (!isPlain(v) || depth > 40 || !hasHandle(v, depth)) return v;
    if (Array.isArray(v)) return v.filter((x) => !hasHandle(x, depth + 1)).map((x) => stripHandles(x, depth + 1));
    const o = {};
    for (const k of Object.keys(v)) if (!isHandle(v[k])) o[k] = stripHandles(v[k], depth + 1);
    return o;
  }

  // Opens an existing database without creating it (an empty v1 database would break the app's own upgrade).
  function openExisting(name) {
    return new Promise((res) => {
      let created = false, r;
      try { r = indexedDB.open(name); } catch { res(null); return; }
      r.onupgradeneeded = (e) => { if (e.oldVersion === 0) { created = true; r.transaction.abort(); } };
      r.onsuccess = () => res(created ? (r.result.close(), null) : r.result);
      r.onerror = (e) => { e.preventDefault?.(); res(null); };
      r.onblocked = () => res(null);
    });
  }
  async function databaseNames(known) {
    const names = new Set(known || []);
    try { if (indexedDB.databases) for (const d of await indexedDB.databases()) if (d.name) names.add(d.name); } catch {}
    return [...names];
  }

  // ---------- sender (old URL) ----------
  async function collect(known) {
    const dbs = [];
    for (const name of await databaseNames(known)) {
      const db = await openExisting(name);
      if (!db) continue;
      const stores = [];
      for (const s of db.objectStoreNames) {
        const tx = db.transaction(s, 'readonly'), os = tx.objectStore(s);
        const indexes = [...os.indexNames].map((i) => { const x = os.index(i); return { name: i, keyPath: x.keyPath, unique: x.unique, multiEntry: x.multiEntry }; });
        stores.push({ name: s, keyPath: os.keyPath, autoIncrement: os.autoIncrement, indexes, count: await req(os.count()) });
      }
      dbs.push({ name, version: db.version, stores, db });
    }
    const ls = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k !== DONE_KEY) ls[k] = localStorage.getItem(k); }
    return { dbs, ls };
  }
  async function hasData(known) {
    const { dbs, ls } = await collect(known);
    dbs.forEach((d) => d.db.close());
    return Object.keys(ls).length > 0 || dbs.some((d) => d.stores.some((s) => s.count > 0));
  }
  // Reads one store as [key, value] pairs, one transaction per batch so large values don't pile up.
  async function* rows(db, store) {
    let last, first = true;
    for (;;) {
      const tx = db.transaction(store, 'readonly'), os = tx.objectStore(store);
      const range = first ? null : IDBKeyRange.lowerBound(last, true);
      const batch = await new Promise((res, rej) => {
        const out = [], c = os.openCursor(range);
        c.onsuccess = () => { const cur = c.result; if (!cur || out.length >= 20) return res(out); out.push([cur.primaryKey, cur.value]); cur.continue(); };
        c.onerror = () => rej(c.error);
      });
      if (!batch.length) return;
      first = false; last = batch[batch.length - 1][0];
      for (const r of batch) yield r;
    }
  }

  function send({ win, origin, known, onProgress }) {
    return new Promise((resolve, reject) => {
      let waiting = null;
      const ask = (msg, transfer) => new Promise((res, rej) => { waiting = { res, rej }; win.postMessage(msg, origin, transfer); });
      const onMsg = (e) => {
        if (e.source !== win || e.origin !== origin || !e.data || typeof e.data !== 'object') return;
        const d = e.data;
        if (d.t === 'ready' && !started) { started = true; run().then(resolve, reject).finally(() => { clearInterval(watch); removeEventListener('message', onMsg); }); return; }
        if (!waiting) return;
        const w = waiting; waiting = null;
        if (d.t === 'error') w.rej(Error(d.message || '移行先でエラーが起きました')); else w.res(d);
      };
      let started = false;
      addEventListener('message', onMsg);
      const watch = setInterval(() => { if (win.closed) { clearInterval(watch); removeEventListener('message', onMsg); const w = waiting; waiting = null; const err = Error('移行先のページが閉じられました'); if (w) w.rej(err); else if (!started) reject(err); } }, 500);
      async function run() {
        const { dbs, ls } = await collect(known);
        const total = dbs.reduce((n, d) => n + d.stores.reduce((m, s) => m + s.count, 0), 0) + Object.keys(ls).length;
        const plan = dbs.map((d) => ({ name: d.name, version: d.version, stores: d.stores.map(({ name, keyPath, autoIncrement, indexes, count }) => ({ name, keyPath, autoIncrement, indexes, count })) }));
        const go = await ask({ t: 'begin', plan, lsCount: Object.keys(ls).length, total });
        if (!go.ok) throw Object.assign(Error('cancelled'), { cancelled: true });
        let done = 0;
        for (const d of dbs) {
          for (const s of d.stores) {
            for await (const [key, value] of rows(d.db, s.name)) {
              if (isHandle(value)) { await ask({ t: 'skip', db: d.name, store: s.name }); done++; continue; }
              await ask({ t: 'row', db: d.name, store: s.name, key: s.keyPath == null ? key : undefined, value: stripHandles(value) });
              onProgress?.(++done, total);
            }
          }
          d.db.close();
        }
        await ask({ t: 'ls', items: ls });
        done += Object.keys(ls).length; onProgress?.(done, total);
        const fin = await ask({ t: 'end' });
        try { localStorage.setItem(DONE_KEY, JSON.stringify({ to: origin, at: new Date().toISOString() })); } catch {}
        return fin;
      }
    });
  }

  // ---------- receiver (new URL, migrate.html) ----------
  function openTarget(info) {
    return new Promise((res, rej) => {
      const r = indexedDB.open(info.name, info.version);
      r.onupgradeneeded = () => {
        const db = r.result;
        for (const s of info.stores) {
          if (db.objectStoreNames.contains(s.name)) continue;
          const os = db.createObjectStore(s.name, { keyPath: s.keyPath ?? undefined, autoIncrement: s.autoIncrement });
          for (const i of s.indexes) os.createIndex(i.name, i.keyPath, { unique: i.unique, multiEntry: i.multiEntry });
        }
      };
      r.onsuccess = () => {
        const db = r.result, missing = info.stores.filter((s) => !db.objectStoreNames.contains(s.name));
        if (missing.length) { db.close(); rej(Error('保存領域の形が違います: ' + info.name)); } else res(db);
      };
      r.onerror = () => rej(r.error?.name === 'VersionError' ? Error('移行先の保存領域が新しい版です: ' + info.name) : r.error);
      r.onblocked = () => rej(Error('このURLのアプリを閉じてから、もう一度移行してください'));
    });
  }

  function receive({ fromRe, ui }) {
    const opener = window.opener;
    if (!opener) { ui.state('noopener'); return; }
    let from = null, plan = null, dbs = new Map(), written = new Map(), skipped = 0, total = 0, done = 0;
    const reply = (msg) => opener.postMessage(msg, from);
    addEventListener('messageerror', () => { if (from) { skipped++; reply({ t: 'ack' }); } });
    addEventListener('message', async (e) => {
      if (e.source !== opener || !(fromRe.test(e.origin) || LOCAL.test(e.origin)) || !e.data || typeof e.data !== 'object') return;
      if (from && e.origin !== from) return;
      from = e.origin;
      const d = e.data;
      try {
        if (d.t === 'begin') {
          plan = d.plan; total = d.total;
          let existing = 0;
          for (const info of plan) {
            const db = await openTarget(info); dbs.set(info.name, db);
            for (const s of info.stores) existing += await req(db.transaction(s.name, 'readonly').objectStore(s.name).count());
          }
          for (const k of Object.keys(localStorage)) if (k !== DONE_KEY) existing++;
          ui.state('progress', 0, total);
          const ok = existing === 0 ? true : await ui.confirmOverwrite();
          if (!ok) { dbs.forEach((db) => db.close()); ui.state('cancelled'); }
          reply({ t: 'go', ok });
        } else if (d.t === 'row') {
          const db = dbs.get(d.db), tx = db.transaction(d.store, 'readwrite'), os = tx.objectStore(d.store);
          if (d.key === undefined) os.put(d.value); else os.put(d.value, d.key);
          await txDone(tx);
          const id = d.db + '\u0000' + d.store; written.set(id, (written.get(id) || 0) + 1);
          ui.state('progress', ++done, total);
          reply({ t: 'ack' });
        } else if (d.t === 'skip') {
          skipped++; done++; reply({ t: 'ack' });
        } else if (d.t === 'ls') {
          for (const [k, v] of Object.entries(d.items || {})) localStorage.setItem(k, v);
          done += Object.keys(d.items || {}).length; ui.state('progress', done, total);
          reply({ t: 'ack' });
        } else if (d.t === 'end') {
          // check: every store now holds at least as many records as were sent
          for (const info of plan) {
            const db = dbs.get(info.name);
            for (const s of info.stores) {
              const have = await req(db.transaction(s.name, 'readonly').objectStore(s.name).count());
              if (have < (written.get(info.name + '\u0000' + s.name) || 0)) throw Error('件数が合いません: ' + info.name + '/' + s.name);
            }
            db.close();
          }
          ui.state('done', done, total, skipped);
          reply({ t: 'done', ok: true, count: done, skipped });
        }
      } catch (err) {
        ui.state('error', String(err && err.message || err));
        reply({ t: 'error', message: String(err && err.message || err) });
      }
    });
    ui.state('waiting');
    opener.postMessage({ t: 'ready' }, '*');
  }

  window.Migration = { send, receive, hasData, DONE_KEY, LOCAL };
})();
