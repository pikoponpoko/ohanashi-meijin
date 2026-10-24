const assert=require('node:assert/strict');globalThis.crypto=require('node:crypto').webcrypto;
require('../dist/model.js');require('../dist/formatting-model.js');const M=ScriptModel,F=ScriptFormatting;
const defaults={font:'Noto Serif JP'},project=text=>M.validate({version:1,chapters:[{id:'c',title:'章',text}]},defaults),body=c=>c.text.split('\n').filter((_,i)=>!c.cuts.some(x=>x.line===i));
for(const mark of ['#1','＃１','#C1','＃Ｃ１','　＃ C１　',' #Ｃ １ ']){
 const p=project(mark+'\n本文A\n　　#C20\n本文B');assert.equal(p.chapters[0].cuts.length,2);assert.deepEqual(body(p.chapters[0]),['本文A','本文B']);assert.equal(p.chapters[0].text,'#C1\n本文A\n#C2\n本文B');assert.equal(JSON.stringify(M.validate(p,defaults)),JSON.stringify(p));
}
for(const heading of ['# 1','#①','＃①','# 1 見出し'])assert.equal(M.externalMarker.test(heading),false);
console.log('PASS standalone half/fullwidth mixed legacy markers normalize once in body order');
for(const raw of ['#1\n#2\nA','\n#1\n#2\nA\n#9\n','A\n\nB','A\r\n\r\nB','A\n\n\nB']){
 const c=M.importChapter({id:'c',title:'章',text:raw});assert.equal(M.realCuts(c).length,raw.includes('B')?2:1);assert.ok(body(c).includes('A'));
}
assert.equal(M.realCuts(M.importChapter({id:'c',title:'章',text:'A\nB'})).length,1);assert.equal(M.realCuts(project('').chapters[0]).length,0);
const q=project('#1\n人「番号は\n#C99\n#1\nです」\n文章中の#1\n#1 見出し');assert.equal(q.chapters[0].cuts.length,1);assert.ok(body(q.chapters[0]).includes('#C99'));assert.ok(body(q.chapters[0]).includes('#1'));
assert.equal(M.realCuts(project('\u200b\n\u2060').chapters[0]).length,0);const padded=M.validate({version:2,chapters:[{id:'p',title:'章',text:'\n#C8\n本文',cuts:[{id:'stable',line:1}],formats:[null,null,'action']}]},defaults);assert.equal(padded.chapters[0].cuts[0].id,'stable');assert.equal(padded.chapters[0].cuts[0].line,0);
console.log('PASS blank separators split once, empty cuts coalesce, quoted markers/prose/headings survive');
let legacy={version:2,chapters:[{id:'c',title:'章',text:'#C8\n#C20\n　＃２１\n動作\n#C1\n台詞',cuts:[{id:'empty',line:0},{id:'actual',line:1},{id:'last',line:4}],formats:[null,null,'action','action',null,'dialogue']}]};let normalized=M.validate(legacy,defaults);assert.deepEqual(normalized.chapters[0].cuts.map(c=>c.id),['actual','last']);assert.deepEqual(normalized.chapters[0].formats,[null,'action',null,'dialogue']);assert.equal(normalized.chapters[0].text,'#C1\n動作\n#C2\n台詞');assert.equal(legacy.chapters[0].text.split('\n').length,6);
console.log('PASS existing real cut IDs and paragraph kinds retained; empty predecessor removed without offset drift');
for(const line of ['　　　自宅・和室（冬・朝５時・３０歳）','　　　ねこ自宅・ダイニング（冬・朝８時）','　　　廊下（春・昼間）','○場所','◯場所','〇場所','場面「３年後山の展望台」'])assert.equal(F.inferred(line),'scene');
for(const line of ['家族写真・子供の手形・ぬいぐるみ','ねこの手元・真っ白な作画用紙'])assert.equal(F.inferred(line),'action');assert.equal(F.inferred('SE：打撃・破壊'),'se');assert.equal(F.inferred('ねこ「廊下（春・昼間）にいる」'),'dialogue');
const c={text:'#C1\n廊下（春・昼間）',cuts:[{id:'one',line:0}],formats:[null,'action'],formatOrigins:[null,'manual']};assert.equal(F.apply(c,F.analyze(c)).formats[1],'action');delete c.formatOrigins;assert.equal(F.analyze(c)[1].certainty,'uncertain');assert.equal(F.apply(c,F.analyze(c)).formats[1],'action');assert.equal(F.apply(c,F.analyze(c),{1:'scene'}).formats[1],'scene');
console.log('PASS scene positive/negative cases; manual/legacy kinds not forcibly reclassified');
if(process.env.SOURCE_PROJECT){const fs=require('fs'),p=JSON.parse(fs.readFileSync(process.env.SOURCE_PROJECT)),before=JSON.stringify(p),v=M.validate(p,defaults);let current=v;
 const kept=new Set(v.chapters.flatMap(c=>c.cuts.map(x=>x.id))),originalIds=p.chapters.flatMap(c=>c.cuts.map(x=>x.id));
 const plain=c=>c.text.split('\n').filter((s,i)=>!c.cuts.some(x=>x.line===i)&&!M.externalMarker.test(s));
 p.chapters.forEach((c,i)=>{assert.deepEqual(plain(v.chapters[i]),plain(c));const kinds=x=>x.text.split('\n').flatMap((s,j)=>x.cuts.some(k=>k.line===j)||M.externalMarker.test(s)?[]:[x.formats?.[j]||null]);assert.deepEqual(kinds(v.chapters[i]),kinds(c));assert.equal(v.chapters[i].title,c.title);assert.equal(v.chapters[i].status,c.status)});for(const key of Object.keys(p))if(key!=='chapters')assert.deepEqual(v[key],p[key]);
 for(let n=0;n<5;n++){current=M.validate(JSON.parse(JSON.stringify(current)),defaults);assert.deepEqual(current,v)}assert.equal(JSON.stringify(p),before);
 console.log('PASS private original: '+JSON.stringify({chapters:v.chapters.map((c,i)=>({before:p.chapters[i].cuts.length,after:c.cuts.length})),originalCuts:originalIds.length,survivingIds:originalIds.filter(id=>kept.has(id)).length,totalCuts:kept.size,reloads:5,exactBodyAndFormats:true}));
 const out=process.env.NORMALIZED_COPY;if(out)fs.writeFileSync(out,JSON.stringify(v,null,2));
}
