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
// IndexedDB overflow rows (dist/persistence.js): active is replaced atomically,
// archive rows are immutable and written once each.
const ARCHIVE=/^archive:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function validateRow(row){
  if(!row||Array.isArray(row)||typeof row!=='object'||typeof row.raw!=='string'||(row.key!=='active'&&!ARCHIVE.test(row.key)))throw Error('Invalid manuscript row');
  const raw=JSON.stringify(row);
  if(Buffer.byteLength(raw)>64*1024*1024)throw Error('Manuscript row exceeds 64 MiB');
  return raw;
}
function createRecordStorage(directory){
  const active=createStorage(path.join(directory,'active')),archives=path.join(directory,'archives');
  fs.mkdirSync(archives,{recursive:true});
  const archiveFile=key=>path.join(archives,key.slice(8)+'.json');
  return {
    read(){
      const rows=[],current=active.read();
      if(current){const row=JSON.parse(current.row);validateRow(row);rows.push(row)}
      for(const name of fs.readdirSync(archives).sort()){
        if(!name.endsWith('.json'))continue;
        try{const row=JSON.parse(fs.readFileSync(path.join(archives,name),'utf8'));validateRow(row);rows.push(row)}catch{}
      }
      return rows.length?rows:null;
    },
    write(rows){
      if(!Array.isArray(rows))throw Error('Invalid manuscript rows');
      const raws=rows.map(validateRow);
      rows.forEach((row,i)=>{
        if(row.key==='active')return;
        const filename=archiveFile(row.key);
        if(!fs.existsSync(filename))atomicWrite(filename,raws[i]);
      });
      rows.forEach((row,i)=>{if(row.key==='active')active.write({row:raws[i]})});
    }
  };
}
module.exports={createStorage,createRecordStorage,validateSnapshot};
