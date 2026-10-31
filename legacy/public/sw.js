// Retirement worker. Keep this URL available for already-installed versions.
// No fetch listener: Chrome handles every request directly, without CacheStorage.
// Never reload clients: they may contain unsaved edits.
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    try{
      await self.clients.claim();
      // Only obsolete application shells; never manuscript/settings storage.
      const keys=await caches.keys();
      await Promise.all(keys.filter(key=>/^ohanashi-shell-v\d+$/.test(key)).map(key=>caches.delete(key)));
    }finally{
      await self.registration.unregister();
    }
  })());
});
