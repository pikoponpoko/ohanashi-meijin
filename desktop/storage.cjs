const fs=require('node:fs');
const path=require('node:path');

function validateSnapshot(value){
  if(!value||Array.isArray(value)||typeof value!=='object'||Object.values(value).some(v=>typeof v!=='string'))throw Error('Invalid storage snapshot');
  const raw=JSON.stringify(value);
  if(Buffer.byteLength(raw)>64*1024*1024)throw Error('Storage snapshot exceeds 64 MiB');
  return raw;
}
function atomicWrite(filename,raw){
  const temporary=filename+'.tmp';
  const fd=fs.openSync(temporary,'w',0o600);
  try{fs.writeFileSync(fd,raw);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
  fs.renameSync(temporary,filename);
}
function createStorage(directory){
  fs.mkdirSync(directory,{recursive:true});
  const latest=path.join(directory,'storage.json'),previous=path.join(directory,'storage.previous.json');
  return {
    read(){
      for(const filename of [latest,previous]){
        if(!fs.existsSync(filename))continue;
        try{const data=JSON.parse(fs.readFileSync(filename,'utf8'));validateSnapshot(data);return data}catch{}
      }
      if(fs.existsSync(latest)||fs.existsSync(previous))throw Error('Saved snapshot cannot be read; existing files have been preserved');
      return null;
    },
    write(value){
      const raw=validateSnapshot(value);
      if(fs.existsSync(latest)){
        const old=fs.readFileSync(latest,'utf8');
        if(old===raw)return;
        // Never replace the fallback with a damaged primary snapshot.
        validateSnapshot(JSON.parse(old));atomicWrite(previous,old);
      }
      atomicWrite(latest,raw);
    }
  };
}
module.exports={createStorage,validateSnapshot};
