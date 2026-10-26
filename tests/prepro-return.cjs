// Merge of a JSON sent back from プリプロ名人: only cuts still equal to プリプロ名人's base change.
const assert=require('assert');
require('../dist/model.js');require('../dist/prepro-return.js');
const {validate,}=ScriptModel,{merge,cutsOf}=PreproReturn;
const doc=(cuts,extra={})=>validate({version:2,title:'作品',author:'作者',font:'Noto Sans JP',workId:'work-1',...extra,chapters:[{id:'ch1',title:'第一章',status:'見直し',
  text:cuts.map(c=>'#C1\n'+c.text).join('\n'),cuts:cuts.reduce((a,c)=>{a.list.push({id:c.id,line:a.line});a.line+=1+c.text.split('\n').length;return a},{list:[],line:0}).list}]},{});
const body=(d,id)=>{for(const c of d.chapters){const x=cutsOf(c).find(x=>x.cut.id===id);if(x)return x.key}return null};
const base={a:'○公園\n　　　ねこが歩く',b:'ねこ「おはよう」',c:'いぬ「やあ」',d:'SE：ベル',e:'　　　空'};
// the manuscript: b edited here since プリプロ名人 imported it, e deleted here, x added here
const current=doc([{id:'a',text:base.a},{id:'b',text:'ねこ「おはよう！」'},{id:'c',text:base.c},{id:'d',text:base.d},{id:'x',text:'ここで足した'}]);
// sent back: a and b edited, c deleted, d unchanged, e edited, n new after a
const incoming=doc([{id:'a',text:'○公園\n　　　ねこが走る'},{id:'n',text:'ト書きの追加\n音楽：テーマ'},{id:'b',text:'ねこ「こんばんは」'},{id:'d',text:base.d},{id:'e',text:'　　　夜空'}]);
const {next,counts}=merge(current,incoming,{version:1,base,removed:[{id:'c',text:base.c}]});
const out=validate(next);
assert.deepStrictEqual({changed:counts.changed,added:counts.added,removed:counts.removed,conflicts:counts.conflicts.length},{changed:1,added:1,removed:1,conflicts:2});
assert.strictEqual(body(out,'a'),'○公園\n　　　ねこが走る');
assert.strictEqual(body(out,'b'),'ねこ「おはよう！」','edited here: the manuscript stays');
assert.strictEqual(body(out,'c'),null,'deleted in プリプロ名人 and unchanged here: removed');
assert.strictEqual(body(out,'d'),base.d);
assert.strictEqual(body(out,'e'),null,'deleted here: not brought back');
assert.strictEqual(body(out,'x'),'ここで足した','added here: kept');
assert.deepStrictEqual(out.chapters[0].cuts.map(c=>c.id),['a','n','b','d','x'],'new cut placed after its predecessor, nothing reordered');
assert.ok(out.chapters[0].soundCues.entries.some(e=>e.kind==='music'&&e.raw==='音楽：テーマ'));
assert.deepStrictEqual([out.title,out.author,out.font,out.workId,out.chapters[0].title,out.chapters[0].status],['作品','作者','Noto Sans JP','work-1','第一章','見直し']);
// edited here only (プリプロ名人 sends its base back): kept without a conflict
const quiet=merge(current,doc([{id:'b',text:base.b}]),{base,removed:[]});
assert.deepStrictEqual([quiet.counts.changed,quiet.counts.conflicts.length,body(validate(quiet.next),'b')],[0,0,'ねこ「おはよう！」']);
// a cut changed both here and in プリプロ名人 to the same words is not a conflict
const same=merge(current,doc([{id:'b',text:'ねこ「おはよう！」'}]),{base,removed:[]});
assert.deepStrictEqual([same.counts.changed,same.counts.conflicts.length],[0,0]);
// a cut deleted in プリプロ名人 but edited here is kept as a conflict
const edited=merge(current,doc([{id:'a',text:base.a}]),{base,removed:[{id:'b',text:base.b}]});
assert.strictEqual(body(validate(edited.next),'b'),'ねこ「おはよう！」');
assert.strictEqual(edited.counts.conflicts.length,1);
console.log('PASS prepro return: base-guarded changes, deletions only when unchanged, conflicts keep the manuscript, new cuts placed by neighbour, work settings kept');
