// Bump the shell version whenever a precached application file changes.
const CACHE='ohanashi-shell-v4';
const SHELL=['./','./index.html','./style.css','./model.js','./app.js','./editing.js','./pdf.js','./projects.js','./pwa.js','./focus.js','./viewport.js','./formatting-model.js','./formatting.js','./layout.js','./timing-model.js','./timing.js','./vendor/jspdf.umd.min.js','./vendor/html-to-image.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png'];
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
  event.respondWith(caches.open(CACHE).then(async cache=>{
    const cached=await cache.match(navigation?new URL('./index.html',self.registration.scope).href:req);
    return cached||fetch(req);
  }));
});
