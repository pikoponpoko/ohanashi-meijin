const assert=require('node:assert/strict');globalThis.crypto=require('node:crypto').webcrypto;
require('../dist/model.js');require('../dist/formatting-model.js');require('../dist/timing-model.js');
const M=ScriptModel,F=ScriptFormatting,T=ScriptTiming;
const defaults={font:'Noto Serif JP'};
const raw={version:2,title:'音響の共通試験',chapters:[{id:'chapter-sound',title:'章',text:'#C1\n○部屋（朝）\n音楽：静かな曲\nSE：足音\n人「音楽も\nSE：これは発話の続き」\n#C2\n　　　振り返る。',cuts:[{id:'stable-a',line:0},{id:'stable-b',line:6}],formats:[null,'scene','action','action','dialogue','dialogue',null,'action']}]};
assert.equal(M.soundText('　　　風','se'),'SE：風');assert.equal(M.soundText('SE：　風','se'),'SE：　風');
const original=JSON.stringify(raw),v=M.validate(raw,defaults),c=v.chapters[0];
assert.equal(JSON.stringify(raw),original);assert.deepEqual(c.soundCues.entries,[{line:2,kind:'music',raw:'音楽：静かな曲'},{line:3,kind:'se',raw:'SE：足音'}]);assert.deepEqual(c.formats,raw.chapters[0].formats);assert.equal(M.paragraphKind(c,2),'music');assert.equal(M.paragraphKind(c,3),'se');assert.equal(M.paragraphKind(c,5),'dialogue');
assert.equal(JSON.stringify(M.validate(v,defaults)),JSON.stringify(v));assert.deepEqual(c.cuts,raw.chapters[0].cuts);
const oldEdit=JSON.parse(JSON.stringify(v));oldEdit.chapters[0].text=oldEdit.chapters[0].text.replace('静かな曲','新しい曲');assert.equal(M.validate(oldEdit,defaults).chapters[0].soundCues.entries[0].raw,'音楽：新しい曲');
const unknown=JSON.parse(JSON.stringify(v));unknown.chapters[0].soundCues.version=99;assert.throws(()=>M.validate(unknown,defaults));
const legacy=M.validate({version:2,chapters:[{id:'legacy',title:'旧原稿',text:'#C1\n音楽「作業の曲」\nSE「風」',cuts:[{id:'legacy-cut',line:0}],formats:[null,'dialogue','dialogue']}]},defaults);assert.equal(legacy.chapters[0].soundCues,undefined);assert.equal(legacy.chapters[0].text,'#C1\n音楽「作業の曲」\nSE「風」');
const unclosed=M.importChapter({title:'音響引用',text:'#C1\n音楽：曲「未完\nSE：足音\n#C2\n次のカット'});assert.equal(unclosed.cuts.length,2);assert.deepEqual(unclosed.soundCues.entries.map(q=>q.kind),['music','se']);
const estimate=T.analyze({...v,rate:300,actionSeconds:5});assert.equal(estimate.musicCues,1);assert.equal(estimate.seCues,1);assert.equal(estimate.actions,1);assert.equal(estimate.speechUnits,1);
const proposal=F.analyze(c);assert.equal(proposal[2].kind,'music');assert.equal(proposal[3].kind,'se');assert.equal(proposal[5].kind,'dialogue');assert.equal(F.apply(c,proposal).text,c.text);
const simple=M.importChapter({id:'simple',title:'変更',text:'曖昧な本文'});const plan=F.analyze(simple);const changed=F.apply(simple,plan,{1:'music'});assert.equal(changed.text,'#C1\n音楽：曖昧な本文');assert.equal(changed.formats[1],'action');assert.equal(changed.soundCues.entries[0].kind,'music');assert.deepEqual(changed.cuts,simple.cuts);
require('node:fs').writeFileSync('docs/interop/samples/sound-v2.json',JSON.stringify(v,null,2)+'\n');
console.log('PASS sound model: additive v2 metadata, unchanged source/IDs/formats, quoted speech guard, legacy preservation, stale witness rebuild and unknown-version rejection');
console.log('PASS sound formatting/timing: independent kinds, explicit conversions, compatible serialized action and audio excluded from speech/action duration');
if(process.env.LEGACY_MODEL_PATH){
 const fs=require('node:fs'),vm=require('node:vm'),ctx={crypto:globalThis.crypto};vm.runInNewContext(fs.readFileSync(process.env.LEGACY_MODEL_PATH,'utf8'),ctx);
 const old=JSON.parse(JSON.stringify(ctx.ScriptModel.validate(v,defaults)));assert.equal(old.version,2);assert.deepEqual(old.chapters[0].cuts,c.cuts);assert.deepEqual(old.chapters[0].formats,c.formats);
 const ch=old.chapters[0],lines=ch.text.split('\n');lines.splice(1,0,'　　　追加の動作。');ch.text=lines.join('\n');ch.formats.splice(1,0,'action');for(const cut of ch.cuts)if(cut.line>=1)cut.line++;
 const reopened=M.validate(old,defaults).chapters[0];assert.deepEqual(reopened.soundCues.entries.map(q=>q.line),[3,4]);assert.deepEqual(reopened.cuts.map(q=>q.id),c.cuts.map(q=>q.id));
 console.log('PASS previous main model reads new v2; after legacy insertion current model rebuilds shifted cue positions without changing cut IDs');
}
