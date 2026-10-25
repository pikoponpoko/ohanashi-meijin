const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const manifest=JSON.parse(fs.readFileSync('dist/manifest.webmanifest','utf8'));
assert.equal(manifest.display,'standalone');assert.equal(manifest.id,'/');assert.equal(manifest.scope,'/');assert.equal(manifest.start_url,'/');
for(const size of [192,512]){
 const icon=manifest.icons.find(x=>x.sizes===`${size}x${size}`);assert.ok(icon);
 const png=fs.readFileSync('dist'+icon.src);assert.equal(png.subarray(1,4).toString(),'PNG');assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size);
}
async function retire(broken=false){
 const events={},deleted=[];let skipped=0,claimed=0,unregistered=0;
 vm.runInNewContext(fs.readFileSync('dist/sw.js','utf8'),{caches:{keys:async()=>{if(broken)throw Error('cache unavailable');return ['other-app-v1','ohanashi-shell-v1','ohanashi-shell-v11','ohanashi-shell-custom']},delete:async key=>deleted.push(key)},self:{skipWaiting:async()=>skipped++,clients:{claim:async()=>claimed++},registration:{unregister:async()=>unregistered++},addEventListener:(name,fn)=>events[name]=fn}});
 assert.equal(events.fetch,undefined,'retired worker must never intercept requests');
 let pending;events.install({waitUntil:p=>pending=p});await pending;assert.equal(skipped,1);
 events.activate({waitUntil:p=>pending=p});if(broken)await assert.rejects(pending);else await pending;
 assert.equal(claimed,1);assert.equal(unregistered,1);if(!broken)assert.deepEqual(deleted,['ohanashi-shell-v1','ohanashi-shell-v11']);
}
(async()=>{await retire();await retire(true);console.log('PASS retirement: immediate activation, no fetch handler, own versioned shells only, unregister even if cache fails; manifest/icons preserved')})().catch(e=>{console.error(e);process.exitCode=1});
