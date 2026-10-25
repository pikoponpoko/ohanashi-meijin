// Dedicated synthetic profiles only; never uses a user's Chrome data.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {_electron:electron}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ohanashi-desktop-test-'));
const profile=path.join(directory,'profile'),checks=[],errors=[];
let currentApp;
function check(name,condition=true){assert.ok(condition,name);checks.push(name);console.log('PASS',name)}
async function launch(userData=profile){
 const binary=process.platform==='darwin'?'Electron.app/Contents/MacOS/Electron':process.platform==='win32'?'electron.exe':'electron';
 const executable=process.env.OHANASHI_TEST_EXECUTABLE||path.join(root,'node_modules/electron/dist',binary);
 assert.ok(fs.existsSync(executable),'Electron executable missing: run node node_modules/electron/install.js');
 const args=process.platform==='linux'?['--no-sandbox','--headless','--ozone-platform=headless','--disable-gpu',root]:[root];
 const app=await electron.launch({executablePath:executable,args,env:{...process.env,OHANASHI_TEST_USER_DATA:userData,XDG_CACHE_HOME:path.join(directory,'cache')}});
 currentApp=app;const page=await app.firstWindow();page.on('pageerror',e=>errors.push(String(e)));await page.waitForSelector('#editor');return {app,page};
}
(async()=>{
 let {app,page}=await launch();
 check('stable local application origin',page.url()==='ohanashi://app/');
 check('renderer has no Node access',await page.evaluate(()=>typeof require==='undefined'&&typeof process==='undefined'));
 check('desktop update button exists',await page.locator('#desktopUpdates').count()===1);
 await app.evaluate(({shell})=>{globalThis.testUpdateURL=null;shell.openExternal=async url=>{globalThis.testUpdateURL=url}});
 await page.locator('#desktopUpdates').click();
 check('update command opens only the repository releases page',await app.evaluate(()=>globalThis.testUpdateURL)==='https://github.com/pikoponpoko/ohanashi-meijin/releases');
 check('privileged IPC rejects other origins',await app.evaluate(async({BrowserWindow},preload)=>{
  const other=new BrowserWindow({show:false,webPreferences:{preload,contextIsolation:true,sandbox:true,nodeIntegration:false}});
  await other.loadURL('about:blank');const result=await other.webContents.executeJavaScript('window.ohanashiDesktop.readBackup()');other.destroy();return result.ok===false;
 },path.join(root,'preload.cjs')));
 await page.evaluate(()=>{state=validate({version:1,title:'ブラウザから移行',dark:true,chapters:[{id:'desktop',title:'第一章',text:'○場所\n花「オフライン原稿」'}]});active=state.chapters[0].id;resetHistory();render();save();localStorage.setItem('desktop-archive-witness','退避は保持')});
 await page.evaluate(async()=>{await document.fonts.load('16px "Noto Serif JP"','原稿');await document.fonts.ready});
 check('bundled Japanese font loads',await page.evaluate(()=>document.fonts.check('16px "Noto Serif JP"','原稿')));
 check('no service worker registration',await page.evaluate(async()=>{
  if([...document.scripts].some(s=>s.src.endsWith('/pwa.js')))return false;
  try{return !navigator.serviceWorker||(await navigator.serviceWorker.getRegistrations()).length===0}catch(e){return e.name==='InvalidStateError'}
 }));
 check('remote application cannot be fetched',await page.evaluate(()=>fetch('https://ohanashi-meijin.pikoponpoko.workers.dev/').then(()=>false,()=>true)));
 const before=await page.evaluate(()=>JSON.parse(JSON.stringify(state)));
 await page.locator('#editor').press('Control+End');await page.keyboard.insertText('追記');
 await page.locator('#editor').press('Control+z');assert.deepEqual(await page.evaluate(()=>state),before);check('offline Undo restores manuscript');
 await page.locator('#editor').press('Control+Shift+z');check('offline Redo restores new input',(await page.evaluate(()=>chapter().text)).includes('追記'));
 await page.evaluate(()=>save());let saved=await page.evaluate(()=>({...localStorage}));
 const backupPath=path.join(profile,'manuscript-backups/storage.json');assert.deepEqual(JSON.parse(fs.readFileSync(backupPath,'utf8')),saved);check('atomic snapshot contains every raw storage value');
 await app.evaluate(({session,dialog},directory)=>{
  dialog.showSaveDialog=async()=>({canceled:false,filePath:directory+'/export.json'});
  session.defaultSession.on('will-download',(_e,item)=>item.setSavePath(directory+'/'+item.getFilename()));
 },directory);
 await page.locator('#backup').click();await page.waitForFunction(()=>document.querySelector('#fileStatus').textContent==='ファイル保存済み');
 const raw=fs.readFileSync(path.join(directory,'export.json'),'utf8');check('native JSON export contains current manuscript',JSON.parse(raw).title==='ブラウザから移行');
 await page.locator('#editor').press('Control+End');await page.keyboard.insertText('上書き');
 await app.evaluate(({dialog})=>{dialog.showSaveDialog=async()=>({canceled:true})});
 await page.locator('#backup').click();await page.waitForFunction(()=>document.querySelector('#fileStatus').textContent==='ファイル保存済み');
 check('save overwrites the chosen file without another picker',fs.readFileSync(path.join(directory,'export.json'),'utf8').includes('上書き'));
 const cancelState=await page.evaluate(()=>JSON.parse(JSON.stringify(state))),cancelFile=fs.readFileSync(path.join(directory,'export.json'),'utf8');
 await page.locator('#saveAs').click();await page.waitForFunction(()=>!document.querySelector('#backup').disabled);
 assert.deepEqual(await page.evaluate(()=>state),cancelState);check('cancelled Save As preserves manuscript and file',fs.readFileSync(path.join(directory,'export.json'),'utf8')===cancelFile);
 const malformed=path.join(directory,'malformed.json');fs.writeFileSync(malformed,'{broken');
 await app.evaluate(({dialog},filename)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[filename]})},malformed);
 await page.locator('#import').click();await page.waitForFunction(()=>document.querySelector('#toast').textContent.startsWith('開けません'));
 assert.deepEqual(await page.evaluate(()=>state),cancelState);check('invalid imported JSON preserves current manuscript');
 const incoming={version:1,title:'移行JSON',dark:true,chapters:[{id:'incoming',title:'第一章',text:'取込本文'}]};
 const imported=path.join(directory,'browser-export.json');fs.writeFileSync(imported,JSON.stringify(incoming));
 await app.evaluate(({dialog},filename)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[filename]})},imported);
 await page.locator('#import').click();await page.waitForFunction(()=>state.title==='移行JSON'||!!document.querySelector('#openWithoutSaving'));
 if(await page.locator('#openWithoutSaving').count())await page.locator('#openWithoutSaving').click();
 check('browser JSON imports locally',await page.evaluate(()=>state.title==='移行JSON'&&chapter().text.includes('取込本文')));
 check('import archives previous manuscript',await page.evaluate(()=>archivedDocuments().some(x=>JSON.parse(x.raw).title==='ブラウザから移行')));
 await page.evaluate(()=>{state.cover=false;render();save()});
 await page.evaluate(()=>printProject(true));
 const deadline=Date.now()+120000;let pdf;
 while(Date.now()<deadline){pdf=fs.readdirSync(directory).find(name=>name.endsWith('.pdf'));if(pdf)break;await new Promise(resolve=>setTimeout(resolve,100))}
 check('offline PDF is generated',!!pdf&&fs.readFileSync(path.join(directory,pdf)).subarray(0,4).toString()==='%PDF');
 await page.locator('#editor').press('Control+End');await page.keyboard.insertText('終了直前');await app.close();
 for(let i=0;i<3;i++){
  ({app,page}=await launch());
  check('offline restart '+(i+1)+' preserves input, archive and preferences',await page.evaluate(()=>chapter().text.includes('終了直前')&&state.dark&&localStorage.getItem('desktop-archive-witness')==='退避は保持'&&archivedDocuments().some(x=>JSON.parse(x.raw).title==='ブラウザから移行')));
  const value=await page.evaluate(()=>({...localStorage}));if(i)assert.deepEqual(value,saved);saved=value;await app.close();
 }
 const restored=path.join(directory,'restored');fs.mkdirSync(path.join(restored,'manuscript-backups'),{recursive:true});fs.copyFileSync(backupPath,path.join(restored,'manuscript-backups/storage.json'));
 ({app,page}=await launch(restored));assert.deepEqual(await page.evaluate(()=>({...localStorage})),saved);check('empty Chromium profile restores all raw values from disk');await app.close();
 check('no application exceptions',errors.length===0);
 fs.writeFileSync(path.join(directory,'results.json'),JSON.stringify({checks,errors},null,2));console.log('Evidence:',directory);console.log(checks.length+' Electron checks passed');
})().catch(async error=>{console.error(error);try{await currentApp?.close()}catch{}process.exit(1)});
