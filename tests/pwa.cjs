const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const manifest=JSON.parse(fs.readFileSync('dist/manifest.webmanifest','utf8'));
assert.equal(manifest.display,'standalone');assert.equal(manifest.id,'/');assert.equal(manifest.scope,'/');assert.equal(manifest.start_url,'/');
for(const size of [192,512]){
  const icon=manifest.icons.find(x=>x.sizes===`${size}x${size}`);assert.ok(icon);
  const png=fs.readFileSync('dist'+icon.src);assert.equal(png.subarray(1,4).toString(),'PNG');assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size);
}
const events={},deleted=[];let precache=[];
const context={URL,Request,Set,Promise,fetch:()=>{throw Error('Unexpected fetch')},caches:{open:async()=>({addAll:async paths=>{precache=paths},match:async()=>({ok:true,cached:true})}),keys:async()=>['other-app-v1','ohanashi-shell-old','ohanashi-shell-v1'],delete:async key=>deleted.push(key)},self:{registration:{scope:'https://example.test/'},location:{origin:'https://example.test'},addEventListener:(name,fn)=>events[name]=fn}};
vm.runInNewContext(fs.readFileSync('dist/sw.js','utf8'),context);
(async()=>{
  let pending;events.install({waitUntil:p=>pending=p});await pending;
  for(const req of precache){const path=new URL(req.url).pathname;assert.equal(req.cache,'reload');assert.ok(fs.existsSync('dist/'+(path==='/'?'index.html':path.slice(1))),path+' missing from precache')}
  events.activate({waitUntil:p=>pending=p});await pending;assert.deepEqual(deleted,['ohanashi-shell-old']);
  for(const request of [{method:'POST',url:'https://example.test/app.js'},{method:'GET',url:'https://external.test/app.js'},{method:'GET',url:'https://example.test/raw.json'},{method:'GET',url:'https://example.test/other',mode:'navigate'}])events.fetch({request,respondWith:()=>assert.fail('Unrelated request intercepted')});
  let response;events.fetch({request:{method:'GET',url:'https://example.test/',mode:'navigate'},respondWith:p=>response=p});assert.ok((await response).cached);
  console.log('PWA checks passed: manifest, PNG dimensions, complete shell, own-cache cleanup, scoped fetch');
})().catch(e=>{console.error(e);process.exitCode=1});
