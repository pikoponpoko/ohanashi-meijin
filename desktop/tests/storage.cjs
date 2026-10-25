const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createStorage}=require('../storage.cjs');
test('atomic snapshots retain manuscript, settings and archive raw strings across restarts',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ohanashi-storage-'));
  const a={'scenario-meijin-v1':'{raw manuscript bytes}',archive:'退避',settings:'{"dark":true}'};
  createStorage(directory).write(a);assert.deepEqual(createStorage(directory).read(),a);
  const b={...a,'scenario-meijin-v1':'new bytes'};createStorage(directory).write(b);
  assert.deepEqual(createStorage(directory).read(),b);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory,'storage.previous.json'),'utf8')),a);
  fs.writeFileSync(path.join(directory,'storage.json'),'{broken');
  assert.deepEqual(createStorage(directory).read(),a);
  assert.throws(()=>createStorage(directory).write(b));
  assert.equal(fs.readFileSync(path.join(directory,'storage.json'),'utf8'),'{broken');
  fs.rmSync(directory,{recursive:true});
});
test('invalid snapshots cannot overwrite existing bytes; unreadable backups block recovery',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ohanashi-storage-'));
  const storage=createStorage(directory);assert.equal(storage.read(),null);storage.write({draft:'keep'});
  assert.throws(()=>storage.write({draft:42}));assert.deepEqual(storage.read(),{draft:'keep'});
  fs.writeFileSync(path.join(directory,'storage.json'),'broken');assert.throws(()=>storage.read());
  assert.equal(fs.readFileSync(path.join(directory,'storage.json'),'utf8'),'broken');
  fs.rmSync(directory,{recursive:true});
});
