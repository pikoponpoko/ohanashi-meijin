const {strict:assert}=require('assert');
require('../dist/model.js');const M=globalThis.ScriptModel;
const defaults={font:'Noto Serif JP'};
const old={version:1,title:'既存作品',chapters:[{id:'old-chapter',title:'第一章',text:'○駅\r\n　　　動作\r\n\r\n\r\n澪「こんにちは」\n#C9\n末尾\n#C9\n'}]};
const migrated=M.validate(old,defaults);assert.equal(migrated.chapters[0].id,'old-chapter');assert.equal(migrated.chapters[0].cuts.length,2);
assert.match(migrated.chapters[0].text,/#C1\n○駅/);assert.match(migrated.chapters[0].text,/#C2\n末尾$/);
const ids=migrated.chapters[0].cuts.map(x=>x.id);assert.equal(new Set(ids).size,2);
assert.deepEqual(M.validate(JSON.parse(JSON.stringify(migrated)),defaults).chapters[0].cuts.map(x=>x.id),ids);
const repaired=M.repair(migrated.chapters[0]);assert.ok(!repaired.text.includes('\n\n\n'));assert.deepEqual(repaired.cuts.map(x=>x.id),ids);M.checkCuts([repaired]);
assert.equal(repaired.text.replace(/^#C\d+$/gm,'').replace(/\s/g,''),migrated.chapters[0].text.replace(/^#C\d+$/gm,'').replace(/\s/g,''));
for(const invalid of [{},{chapters:[]},{chapters:[{title:'壊れたJSON'}]},{version:8,chapters:old.chapters},{...migrated,chapters:[{...migrated.chapters[0],cuts:[{id:'x',line:99}]}]}])assert.throws(()=>M.validate(invalid,defaults));
const insertion=M.migrateChapter({id:'inserted',title:'挿入',text:'本文'});migrated.chapters.unshift(insertion);M.renumber(migrated);assert.deepEqual(migrated.chapters[1].cuts.map(x=>x.id),ids);assert.match(migrated.chapters[1].text,/^#C2/);
console.log('Model checks passed: legacy migration, IDs, duplicate numbers, empty cuts, repair, validation, global numbering');
// Explicit removal must eliminate single and repeated visual blanks, not just \n\n\n.
for(const blank of ['', ' ', '\u3000', '\t', '\u00a0', '\u200b', '\u2060']){
  const chapter=M.migrateChapter({id:'cleanup',title:'空行',text:blank+'\n○場\n'+blank+'\n#C8\n'+blank+'\n人「言葉」\n'+blank});
  chapter.formats=chapter.text.split('\n').map((_,i)=>i===1?'scene':null);
  const ids=chapter.cuts.map(c=>c.id),clean=M.removeBlankLines(chapter);
  assert.equal(clean.text,'#C1\n○場\n#C8\n人「言葉」');assert.deepEqual(clean.cuts.map(c=>c.id),ids);
  assert.equal(clean.formats.length,4);M.checkCuts([clean]);assert.deepEqual(M.removeBlankLines(clean),clean);
}
const emptyCuts=M.migrateChapter({id:'empty',title:'空カット',text:'#C1\n\n#C2\n'});
const cleanEmpty=M.removeBlankLines(emptyCuts);assert.equal(cleanEmpty.text,'#C1\n#C2');assert.equal(cleanEmpty.cuts.length,2);
const embedded=M.migrateChapter({title:'文字保持',text:'人「中\u200b身」'});assert.ok(M.removeBlankLines(embedded).text.includes('中\u200b身'));
console.log('Explicit blank removal checks passed: whitespace, zero-width-only lines, cut IDs, formats, empty cuts, idempotence');
