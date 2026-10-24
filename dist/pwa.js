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
  navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(registration=>{
    const notify=()=>{if(registration.waiting&&navigator.serviceWorker.controller)toast('更新はアプリの画面をすべて閉じた後に適用されます。')};
    notify();registration.addEventListener('updatefound',()=>{const worker=registration.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed')notify()})});
  }).catch(()=>toast('オフライン用の準備ができませんでした。オンラインで引き続き利用できます。'));
}
