// Cloud sync merge: base = last synced cloud copy. One-sided changes apply, both-sided ones are conflicts kept as here.
const assert=require('assert');
require('../dist/model.js');require('../dist/formatting-model.js');require('../dist/cloud-model.js');
const {validate}=ScriptModel,{merge,scriptKey,outgoing,cutsOf}=CloudModel;
const chapter=(id,title,cuts)=>({id,title,status:'未着手',text:cuts.map(c=>'#C1\n'+c.text).join('\n'),
  cuts:cuts.reduce((a,c)=>{a.list.push({id:c.id,line:a.line});a.line+=1+c.text.split('\n').length;return a},{list:[],line:0}).list});
const doc=(chapters,extra={})=>validate({version:2,title:'作品',author:'作者',font:'Noto Serif JP',workId:'work-1',cloudLinkId:'work_cloud_1',...extra,chapters},{});
const body=(d,id)=>{for(const c of d.chapters){const x=cutsOf(c).find(x=>x.cut.id===id);if(x)return x.rows.map(r=>r.text).join('\n').replace(/\n+$/,'')}return null};
const ids=d=>d.chapters.map(c=>c.cuts.map(x=>x.id));
const t={a:'○公園\n　　　ねこが歩く',b:'ねこ「おはよう」',c:'いぬ「やあ」',d:'SE：ベル',e:'　　　空'};
const base=doc([chapter('ch1','第一章',[{id:'a',text:t.a},{id:'b',text:t.b},{id:'c',text:t.c}]),chapter('ch2','第二章',[{id:'d',text:t.d},{id:'e',text:t.e}])]);
// here: b edited, e deleted, x added
const local=doc([chapter('ch1','第一章',[{id:'a',text:t.a},{id:'b',text:'ねこ「おはよう！」'},{id:'c',text:t.c}]),chapter('ch2','第二章',[{id:'d',text:t.d},{id:'x',text:'ここで足した'}])],{font:'Noto Sans JP',direction:'horizontal'});
// cloud: a edited, c deleted, n added after a, chapter 2 renamed, work title changed
const cloud=doc([chapter('ch1','第一章',[{id:'a',text:'○公園\n　　　ねこが走る'},{id:'n',text:'ト書きの追加\n音楽：テーマ'},{id:'b',text:t.b}]),chapter('ch2','二',[{id:'d',text:t.d},{id:'e',text:t.e}])],{title:'作品（改）'});
let r=merge(base,local,cloud);let out=validate(r.next);
assert.strictEqual(r.conflicts.length,0,'one-sided changes only');
assert.strictEqual(body(out,'a'),'○公園\n　　　ねこが走る');
assert.strictEqual(body(out,'b'),'ねこ「おはよう！」','edited here, unchanged in the cloud: stays');
assert.strictEqual(body(out,'c'),null,'deleted in the cloud, unchanged here: goes');
assert.strictEqual(body(out,'e'),null,'deleted here, unchanged in the cloud: stays deleted');
assert.strictEqual(body(out,'x'),'ここで足した');
assert.deepStrictEqual(ids(out),[['a','n','b'],['d','x']]);
assert.deepStrictEqual([out.title,out.chapters[1].title,out.font,out.direction,out.cloudLinkId],['作品（改）','二','Noto Sans JP','horizontal','work_cloud_1'],'device settings stay');
assert.ok(out.chapters[0].soundCues.entries.some(e=>e.kind==='music'&&e.raw==='音楽：テーマ'));
// both sides edited the same cut differently: conflict, kept as here unless the cloud is chosen
const cloud2=doc([chapter('ch1','第一章',[{id:'a',text:t.a},{id:'b',text:'ねこ「こんばんは」'},{id:'c',text:t.c}]),chapter('ch2','第二章',[{id:'d',text:t.d},{id:'e',text:'　　　夜空'}])]);
r=merge(base,local,cloud2);
assert.deepStrictEqual(r.conflicts.map(c=>[c.id,c.type]),[['cut:b','cut'],['cut:e','deleted']]);
assert.strictEqual(body(validate(r.next),'b'),'ねこ「おはよう！」');
assert.strictEqual(body(validate(r.next),'e'),null);
r=merge(base,local,cloud2,{'cut:b':'cloud','cut:e':'cloud'});out=validate(r.next);
assert.strictEqual(body(out,'b'),'ねこ「こんばんは」');
assert.deepStrictEqual(ids(out),[['a','b','c'],['d','e','x']],'restored cut goes back after its neighbour');
// same edit on both sides is no conflict; nothing changed in the cloud changes nothing here
assert.strictEqual(merge(base,local,doc(local.chapters)).conflicts.length,0);
assert.strictEqual(scriptKey(validate(merge(base,local,base).next)),scriptKey(local));
// a missing paragraph format reads as the inferred one
const withFormats=JSON.parse(JSON.stringify(local));withFormats.chapters.forEach(c=>{c.formats=c.text.split('\n').map((l,i)=>c.cuts.some(x=>x.line===i)?null:ScriptFormatting.inferred(l).replace(/^(music|se)$/,'action'))});
assert.strictEqual(scriptKey(withFormats),scriptKey(local));
withFormats.chapters[0].formats[2]='scene';assert.notStrictEqual(scriptKey(withFormats),scriptKey(local),'a format set by hand is a change');
// edited here but deleted in the cloud: conflict, kept unless the cloud is chosen
const cloud3=doc([chapter('ch1','第一章',[{id:'a',text:t.a},{id:'c',text:t.c}]),chapter('ch2','第二章',[{id:'d',text:t.d},{id:'e',text:t.e}])]);
r=merge(base,local,cloud3);assert.deepStrictEqual(r.conflicts.map(c=>c.type),['removed']);assert.strictEqual(body(validate(r.next),'b'),'ねこ「おはよう！」');
assert.strictEqual(body(validate(merge(base,local,cloud3,{'cut:b':'cloud'}).next),'b'),null);
// a chapter new in the cloud lands after its predecessor; a chapter deleted in the cloud goes when nothing here is left
const cloud4=doc([chapter('ch1','第一章',[{id:'a',text:t.a},{id:'b',text:t.b},{id:'c',text:t.c}]),chapter('ch3','新章',[{id:'z',text:'新しい'}])]);
const local4=doc([base.chapters[0],chapter('ch2','第二章',[{id:'d',text:t.d},{id:'e',text:t.e}])]);
out=validate(merge(base,local4,cloud4).next);
assert.deepStrictEqual(out.chapters.map(c=>c.id),['ch1','ch3']);
// no base yet (first sync after linking): differences are conflicts, nothing is lost
r=merge(null,local,cloud);assert.ok(r.conflicts.length>0);assert.strictEqual(body(validate(r.next),'b'),'ねこ「おはよう！」');assert.strictEqual(body(validate(r.next),'x'),'ここで足した');
// the copy that goes up carries the link ID and no file-return notes
const up=outgoing({...local,preproReturn:{base:{}}},'work_cloud_1');
assert.ok(!('preproReturn' in up));assert.strictEqual(up.cloudLinkId,'work_cloud_1');assert.strictEqual(up.version,2);
console.log('PASS cloud: one-sided changes apply, conflicts keep the manuscript or take the cloud by choice, deletions guarded, device settings stay');
