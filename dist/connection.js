// Shared by the editor and the independent repair page. No storage writes.
window.ohanashiConnection={
  async retire(){
    if(!('serviceWorker' in navigator)||!window.isSecureContext)return;
    const scope=new URL('./',location.href).href;
    const script=new URL('sw.js',scope).href;
    const registrations=await navigator.serviceWorker.getRegistrations();
    for(const registration of registrations){
      const workers=[registration.active,registration.waiting,registration.installing].filter(Boolean);
      if(registration.scope===scope&&workers.length&&workers.every(worker=>worker.scriptURL===script)){
        await registration.unregister();
      }
    }
  }
};
