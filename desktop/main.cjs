const {app,BrowserWindow,protocol,net,ipcMain,shell,dialog,session}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const {randomUUID}=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {createStorage,createRecordStorage}=require('./storage.cjs');
const ORIGIN='ohanashi://app';
const RELEASES='https://github.com/pikoponpoko/ohanashi-meijin/releases';
protocol.registerSchemesAsPrivileged([{scheme:'ohanashi',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
// Stable across versions, installer replacement and future macOS builds.
app.setPath('userData',process.env.OHANASHI_TEST_USER_DATA||path.join(app.getPath('appData'),'OhanashiMeijin'));
let win;
if(!app.requestSingleInstanceLock()){app.quit()}else{
  app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.focus()}});
  app.whenReady().then(()=>{
    const web=path.join(__dirname,'web');
    const storage=createStorage(path.join(app.getPath('userData'),'manuscript-backups'));
    const records=createRecordStorage(path.join(app.getPath('userData'),'manuscript-backups','indexeddb'));
    protocol.handle('ohanashi',request=>{
      const url=new URL(request.url);
      if(url.host!=='app')return new Response('Not found',{status:404});
      let filename;
      try{filename=path.resolve(web,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname))}catch{return new Response('Bad path',{status:400})}
      if(!filename.startsWith(web+path.sep))return new Response('Forbidden',{status:403});
      return net.fetch(pathToFileURL(filename).href);
    });
    session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
    session.defaultSession.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!['ohanashi:','file:','data:','blob:','devtools:'].includes(new URL(details.url).protocol)}));
    session.defaultSession.webRequest.onHeadersReceived((details,callback)=>callback({responseHeaders:{...details.responseHeaders,'Content-Security-Policy':["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; connect-src 'self' data: blob:; object-src 'none'; base-uri 'none'; frame-src 'none'"]}}));
    session.defaultSession.on('will-download',(_event,item)=>item.setSaveDialogOptions({title:'ファイルを保存',defaultPath:path.join(app.getPath('documents'),path.basename(item.getFilename()))}));
    const trusted=event=>event.senderFrame===event.sender.mainFrame&&event.senderFrame.url.startsWith(ORIGIN+'/');
    const files=new Map();
    function remember(filename){const token=randomUUID();files.set(token,filename);return {token,name:path.basename(filename)}}
    ipcMain.handle('file-save-dialog',async(event,suggestedName)=>{
      if(!trusted(event))throw Error('Unauthorized frame');
      const result=await dialog.showSaveDialog(win,{title:'原稿を保存',defaultPath:path.join(app.getPath('documents'),path.basename(String(suggestedName||'脚本.json'))),filters:[{name:'脚本 JSON',extensions:['json']}]});
      return result.canceled?null:remember(result.filePath);
    });
    ipcMain.handle('file-open-dialog',async event=>{
      if(!trusted(event))throw Error('Unauthorized frame');
      const result=await dialog.showOpenDialog(win,{title:'原稿を開く',properties:['openFile'],filters:[{name:'脚本',extensions:['json','txt','md']}]});
      return result.canceled?null:remember(result.filePaths[0]);
    });
    ipcMain.handle('file-read',async(event,token)=>{
      if(!trusted(event)||!files.has(token))throw Error('Unauthorized file');
      const filename=files.get(token);if(fs.statSync(filename).size>64*1024*1024)throw Error('File too large');
      return fs.readFileSync(filename,'utf8');
    });
    ipcMain.handle('file-write',async(event,token,content)=>{
      if(!trusted(event)||!files.has(token)||typeof content!=='string'||Buffer.byteLength(content)>64*1024*1024)throw Error('Unauthorized file');
      const filename=files.get(token),temporary=filename+'.'+randomUUID()+'.tmp';
      const fd=fs.openSync(temporary,'wx',0o600);
      try{fs.writeFileSync(fd,content);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
      fs.renameSync(temporary,filename);
    });
    ipcMain.on('storage-read',event=>{
      try{if(!trusted(event))throw Error('Unauthorized frame');event.returnValue={ok:true,value:storage.read()}}catch{event.returnValue={ok:false,error:'Backup read failed'}}
    });
    ipcMain.on('storage-write',(event,value)=>{
      try{if(!trusted(event))throw Error('Unauthorized frame');storage.write(value);event.returnValue={ok:true}}catch{event.returnValue={ok:false,error:'Backup write failed'}}
    });
    ipcMain.on('database-read',event=>{
      try{if(!trusted(event))throw Error('Unauthorized frame');event.returnValue={ok:true,value:records.read()}}catch{event.returnValue={ok:false,error:'Backup read failed'}}
    });
    ipcMain.handle('database-write',(event,rows)=>{
      if(!trusted(event))throw Error('Unauthorized frame');
      try{records.write(rows)}catch{throw Error('Backup write failed')}
    });
    ipcMain.handle('check-updates',event=>{if(!trusted(event))throw Error('Unauthorized frame');return shell.openExternal(RELEASES)});
    function open(){
      win=new BrowserWindow({width:1360,height:920,minWidth:740,minHeight:560,title:'おはなし名人',icon:path.join(web,'icons/official-192.png'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
      win.setMenuBarVisibility(false);
      win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
      win.webContents.on('will-navigate',(event,url)=>{const target=new URL(url);if(target.protocol!=='ohanashi:'||target.host!=='app')event.preventDefault()});
      win.loadURL(ORIGIN+'/');
    }
    open();app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)open()});
  }).catch(()=>{dialog.showErrorBox('おはなし名人','起動できませんでした。保存データは削除していません。');app.quit()});
  app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
}
