let installPrompt=null;
const installButton=$('#installApp');
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;installButton.hidden=false});
window.addEventListener('appinstalled',()=>{installPrompt=null;installButton.hidden=true});
installButton.onclick=async()=>{
  if(!installPrompt)return;
  const prompt=installPrompt;installPrompt=null;installButton.hidden=true;
  try{await prompt.prompt();await prompt.userChoice}catch(_){toast('ブラウザのメニューからインストールしてください。')}
};
if('serviceWorker' in navigator&&window.isSecureContext){
  // Offline caching is suspended. Never register again after repair.
  window.ohanashiConnection.retire().catch(error=>{
    console.warn('[ohanashi:service-worker-retirement]',error);
    toast('接続設定の更新ができませんでした。原稿を保存して接続の修復ページを開いてください。');
  });
}
