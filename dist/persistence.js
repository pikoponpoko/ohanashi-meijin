// Overflow storage: never remove or migrate existing localStorage values.
// A switch here commits the archive and active document in one transaction.
window.ManuscriptStorage=(()=>{
  const KEY='scenario-meijin-v1';
  let db=null,usingDatabase=false,activeRaw=null,archives=[];
  let changes;try{
    changes=new BroadcastChannel('ohanashi-manuscripts-v1');
    changes.onmessage=()=>{usingDatabase=true;window.dispatchEvent(new Event('manuscriptstoragechange'))};
  }catch(_){}
  const ready=new Promise(resolve=>{
    let request;
    try{request=indexedDB.open('ohanashi-manuscripts-v1',1)}catch(_){resolve();return}
    request.onupgradeneeded=()=>request.result.createObjectStore('records',{keyPath:'key'});
    request.onerror=request.onblocked=()=>resolve();
    request.onsuccess=()=>{
      db=request.result;db.onversionchange=()=>{db.close();db=null};
      const read=db.transaction('records').objectStore('records').getAll();
      read.onsuccess=()=>{
        const active=read.result.find(row=>row.key==='active');
        if(active&&typeof active.raw==='string'){activeRaw=active.raw;usingDatabase=true}
        archives=read.result.filter(row=>row.key.startsWith('archive:')&&typeof row.raw==='string');resolve();
      };
      read.onerror=()=>resolve();
    };
  });
  async function commit(raw,archive){
    usingDatabase=true;await ready;
    if(!db)throw Error('Additional manuscript storage unavailable');
    const known=new Set(archives.map(row=>row.raw)),entries=[];
    for(const value of (Array.isArray(archive)?archive:archive?[archive]:[])){
      if(!known.has(value.raw)){entries.push({...value,key:'archive:'+crypto.randomUUID()});known.add(value.raw)}
    }
    await new Promise((resolve,reject)=>{
      const tx=db.transaction('records','readwrite'),store=tx.objectStore('records');
      tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(tx.error||Error('Manuscript transaction failed'));
      try{for(const entry of entries)store.put(entry);store.put({key:'active',raw})}catch(error){tx.abort();reject(error)}
    });
    activeRaw=raw;archives.push(...entries);changes?.postMessage('saved');
  }
  async function readRaw(){
    await ready;
    if(!db){if(usingDatabase)throw Error('Manuscript storage unavailable');return localStorage.getItem(KEY)}
    const row=await new Promise((resolve,reject)=>{
      const request=db.transaction('records').objectStore('records').get('active');
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
    return row&&typeof row.raw==='string'?row.raw:localStorage.getItem(KEY);
  }
  return {ready,commit,readRaw,get usingDatabase(){return usingDatabase},get activeRaw(){return activeRaw},get archives(){return archives.slice()}};
})();
