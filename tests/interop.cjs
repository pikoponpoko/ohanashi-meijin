// Run with PREPRO_REFERENCE=/path/to/read-only/main-snapshot (ES modules).
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
globalThis.crypto=require('node:crypto').webcrypto;require('../dist/model.js');require('../dist/formatting-model.js');
(async()=>{
 const root=process.env.PREPRO_REFERENCE;if(!root)throw Error('PREPRO_REFERENCE is required; never modify the receiver repository');
 const {readScript}=await import(pathToFileURL(path.join(root,'js/scriptbridge.js')));
 const M=ScriptModel,F=ScriptFormatting;
 let v=M.validate({version:2,title:'共通検証原稿',chapters:[{id:'chapter-a',title:'一章',text:'#C1\n自宅・和室（冬・朝５時・３０歳）\n\n\n音楽：穏やかな曲\nSE：足音\n人「途中で\n続く台詞」\n#C2\n廊下（春・昼間）\n　　　振り返る。',cuts:[{id:'cut-a',line:0},{id:'cut-b',line:8}],formats:[null,'action',null,null,'action','action','dialogue','dialogue',null,'action','action']} ]},{});
 const before=readScript(JSON.stringify(v),'before.json');
 v.chapters=v.chapters.map(c=>{const plan=F.analyze(c),choices={};for(const row of plan)if(row.kind==='scene')choices[row.line]='scene';return M.tidyBlankLines(F.apply(c,plan,choices))});M.renumber(v);
 const serialized=JSON.stringify(v),after=readScript(serialized,'after.json');
 assert.deepEqual(before.cuts.map(c=>c.id),after.cuts.map(c=>c.id));assert.deepEqual(after.cuts.map(c=>c.chapterId),['chapter-a','chapter-a']);assert.equal(after.cuts[0].lines.find(l=>l.kind==='music').text,'穏やかな曲');assert.equal(after.cuts[0].lines.find(l=>l.kind==='se').text,'足音');assert.equal(after.cuts[0].lines.find(l=>l.kind==='normal').text,'途中で\n続く台詞');assert.ok(after.cuts[0].heading.includes('和室'));assert.ok(after.cuts[1].heading.includes('廊下'));assert.deepEqual(after.cuts[1].lines.map(l=>l.kind),['action']);assert.equal(JSON.stringify(v),serialized);
 fs.writeFileSync('docs/interop/samples/native-v2.json',JSON.stringify(v,null,2)+'\n');
 const audio=M.validate(JSON.parse(fs.readFileSync('docs/interop/samples/sound-v2.json')),{}),audioText=JSON.stringify(audio),got=readScript(audioText,'sound.json');
 const plain=JSON.parse(audioText);plain.chapters.forEach(c=>delete c.soundCues);
 assert.deepEqual(got,readScript(JSON.stringify(plain),'sound.json'));
 assert.deepEqual(got.cuts[0].lines.filter(l=>['music','se'].includes(l.kind)).map(l=>[l.kind,l.speaker,l.text]),[['music',null,'静かな曲'],['se',null,'足音']]);
 assert.equal(got.cuts[0].lines.find(l=>l.kind==='normal').text,'音楽も\nSE：これは発話の続き');
 assert.equal(JSON.stringify(audio),audioText);
 console.log('PASS receiver current main: new soundCues and legacy-prefix-only JSON yield identical music/SE, null speakers, preserved wrapped speech and stable cut IDs');
 const proposal=JSON.parse(fs.readFileSync('docs/interop/samples/baseline.json'));assert.throws(()=>readScript(JSON.stringify(proposal),'draft.json'));assert.ok(readScript(JSON.stringify(proposal),'draft.json',{allowDraft:true}).cuts.length);
 console.log('PASS receiver main: unchanged v2 IDs and chapter order, repaired structural headings, music/SE prefixes, wrapped dialogue, action lines; source immutable');console.log('PASS existing draft.1: normal import rejects unapproved draft; explicit trial accepts unchanged sample');
 process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
