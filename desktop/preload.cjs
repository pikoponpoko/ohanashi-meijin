const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('ohanashiDesktop',{
  readBackup:()=>ipcRenderer.sendSync('storage-read'),
  persistStorage:snapshot=>ipcRenderer.sendSync('storage-write',snapshot),
  chooseSave:name=>ipcRenderer.invoke('file-save-dialog',name),
  chooseOpen:()=>ipcRenderer.invoke('file-open-dialog'),
  readFile:token=>ipcRenderer.invoke('file-read',token),
  writeFile:(token,content)=>ipcRenderer.invoke('file-write',token,content),
  checkUpdates:()=>ipcRenderer.invoke('check-updates')
});
