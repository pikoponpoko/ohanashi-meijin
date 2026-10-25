const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('dist/connection.js','utf8');
async function run(secure=true){
 const removed=[];const root='https://example.test/';
 const registration=(scope,scriptURL)=>({scope,active:{scriptURL},unregister:async()=>removed.push(scope)});
 const window={isSecureContext:secure};
 vm.runInNewContext(source,{window,URL,location:{href:root+'recovery.html'},navigator:{serviceWorker:{getRegistrations:async()=>[
 registration(root,root+'sw.js'),registration(root+'other/',root+'other/sw.js'),registration(root,root+'unrelated.js')
 ]}}});
 await window.ohanashiConnection.retire();assert.deepEqual(removed,secure?[root]:[]);
}
(async()=>{await run();await run(false);assert.doesNotMatch(fs.readFileSync('dist/pwa.js','utf8'),/serviceWorker\.register\(/);for(const name of ['connection.js','sw.js','recovery.js'])assert.doesNotMatch(fs.readFileSync('dist/'+name,'utf8'),/localStorage\.(clear|removeItem|setItem)\(/);console.log('PASS repair: exact worker URL/scope only, insecure context safe, no re-registration or manuscript writes')})().catch(e=>{console.error(e);process.exitCode=1});
