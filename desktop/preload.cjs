const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('ohanashiDesktop',{
  readBackup:()=>ipcRenderer.sendSync('storage-read'),
  persistStorage:snapshot=>ipcRenderer.sendSync('storage-write',snapshot),
  readDatabaseBackup:()=>ipcRenderer.sendSync('database-read'),
  persistDatabase:rows=>ipcRenderer.invoke('database-write',rows),
  chooseSave:name=>ipcRenderer.invoke('file-save-dialog',name),
  chooseOpen:()=>ipcRenderer.invoke('file-open-dialog'),
  readFile:token=>ipcRenderer.invoke('file-read',token),
  writeFile:(token,content)=>ipcRenderer.invoke('file-write',token,content),
  saveDownload:(name,data)=>ipcRenderer.invoke('save-download',name,data),
  checkUpdates:()=>ipcRenderer.invoke('check-updates')
});
