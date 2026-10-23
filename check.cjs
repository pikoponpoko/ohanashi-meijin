const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync('dist/app.js','utf8');
function fn(name){const start=source.indexOf('function '+name+'(');let end=source.indexOf('\n',start);return source.slice(start,end<0?undefined:end)}
const ctx=vm.createContext({state:{title:'試験',author:'作者',date:'2026-10-23',draft:2,rate:300,actionSeconds:5,chapters:[{title:'第一章',text:'○駅（朝）\n　　　雨が降る。\n澪「こんにちは」'}]},chapter:()=>({text:'ト書き\n澪「こんにちは\n　　　彼は悲しい。\n澪「…」'})});
vm.runInContext([fn('type'),fn('estimate'),fn('exportText'),fn('issues')].join('\n'),ctx);
assert.equal(vm.runInContext("type('○駅（朝）')",ctx),'scene');assert.equal(vm.runInContext("type('澪「こんにちは」')",ctx),'dialogue');assert.equal(vm.runInContext("type('　　　雨が降る。')",ctx),'action');
assert.equal(vm.runInContext("estimate('○駅（朝）\\n　　　雨が降る。\\n澪「こんにちは」')",ctx),6);
assert.match(vm.runInContext('exportText(true)',ctx),/## 1\. 第一章/);assert.match(vm.runInContext('exportText(false)',ctx),/第2稿/);assert.equal(vm.runInContext('issues().length',ctx),4);
console.log('7 checks passed: line types, duration, TXT / Markdown, correction suggestions');
