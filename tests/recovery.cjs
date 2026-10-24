const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('dist/sw.js','utf8');
async function navigate({cacheError=false,networkError=false,cached=false}={}){
  const events={};let networkCalls=0,promise;
  const context={URL,Request,Response,Set,Promise,Error,caches:{open:async()=>{if(cacheError)throw Error('cache unavailable');return {match:async()=>cached?new Response('cached editor'):undefined}}},fetch:async()=>{networkCalls++;if(networkError)throw Error('offline');return new Response('online editor')},self:{registration:{scope:'https://example.test/'},location:{origin:'https://example.test'},addEventListener:(name,fn)=>events[name]=fn}};
  vm.runInNewContext(source,context);events.fetch({request:{method:'GET',url:'https://example.test/',mode:'navigate'},respondWith:p=>promise=p});const response=await promise;return {response,text:await response.text(),networkCalls};
}
(async()=>{
 let r=await navigate({cacheError:true});assert.equal(r.text,'online editor');assert.equal(r.networkCalls,1);
 r=await navigate({cached:true,networkError:true});assert.equal(r.text,'cached editor');assert.equal(r.networkCalls,0);
 r=await navigate({cacheError:true,networkError:true});assert.equal(r.response.status,503);assert.match(r.text,/recovery\.html/);assert.equal(r.response.headers.get('Cache-Control'),'no-store');
 console.log('PASS recovery: cache exceptions fall back online; cached offline editor retained; uncached failure has a repair link');
})().catch(e=>{console.error(e);process.exitCode=1});
