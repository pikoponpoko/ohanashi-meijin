// Bump the shell version whenever a precached application file changes.
const CACHE='ohanashi-shell-v11';
const SHELL=['./','./index.html','./style.css','./model.js','./app.js','./editing.js','./pdf.js','./projects.js','./pwa.js','./focus.js','./viewport.js','./formatting-model.js','./formatting.js','./files.js','./layout.js','./timing-model.js','./timing.js','./vendor/jspdf.umd.min.js','./vendor/html-to-image.js','./manifest.webmanifest','./icons/official-32.png','./icons/official-180.png','./icons/official-192.png','./icons/official-512.png'];
const shellUrls=new Set(SHELL.map(path=>new URL(path,self.registration.scope).href));
self.addEventListener('install',event=>{
  // Deliberately no skipWaiting: edited documents must never be force-reloaded.
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL.map(path=>new Request(new URL(path,self.registration.scope).href,{cache:'reload'})))));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('ohanashi-shell-')&&key!==CACHE).map(key=>caches.delete(key)))));
});
self.addEventListener('fetch',event=>{
  const req=event.request,url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==self.location.origin)return;
  const navigation=req.mode==='navigate'&&(url.pathname==='/'||url.pathname==='/index.html');
  if(!navigation&&!shellUrls.has(url.href))return;
  event.respondWith((async()=>{
    // A damaged/unavailable browser cache must not turn an online navigation
    // into Chrome ERR_FAILED. The manuscript lives in localStorage, untouched.
    try{
      const cache=await caches.open(CACHE);
      const cached=await cache.match(navigation?new URL('./index.html',self.registration.scope).href:req);
      if(cached)return cached;
    }catch(_){}
    try{return await fetch(req)}catch(error){
      if(!navigation)throw error;
      return new Response('<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>接続の確認</title><main><h1>接続できませんでした</h1><p>原稿データは削除していません。オンラインに戻して再読み込みしてください。</p><p><a href="./recovery.html">原稿を保存して接続を修復</a></p></main></html>',{status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
    }
  })());
});
