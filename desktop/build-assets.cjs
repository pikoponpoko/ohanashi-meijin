const fs=require('node:fs');
const path=require('node:path');
const root=__dirname,web=path.join(root,'web');
// This directory contains generated assets only, never profile data.
fs.rmSync(web,{recursive:true,force:true});fs.mkdirSync(web,{recursive:true});
fs.cpSync(path.join(root,'../dist'),web,{recursive:true});
const families=['noto-serif-jp','noto-sans-jp','zen-old-mincho'];
let css='';
for(const family of families){
  const source=path.join(root,'node_modules/@fontsource',family);
  fs.mkdirSync(path.join(web,'fonts',family),{recursive:true});
  fs.copyFileSync(path.join(source,'LICENSE'),path.join(web,'fonts',family,'LICENSE'));
  for(const weight of (family==='noto-serif-jp'?[400,500,600]:family==='noto-sans-jp'?[400,500]:[400])){
    const sheet=fs.readFileSync(path.join(source,weight+'.css'),'utf8').replace(/, url\(\.\/files\/[^)]+\.woff\) format\('woff'\)/g,'');
    for(const match of sheet.matchAll(/url\(\.\/files\/([^)]+)\)/g))fs.copyFileSync(path.join(source,'files',match[1]),path.join(web,'fonts',family,match[1]));
    css+=sheet.replaceAll('./files/',`./fonts/${family}/`);
  }
}
fs.writeFileSync(path.join(web,'fonts.css'),css);
let html=fs.readFileSync(path.join(web,'index.html'),'utf8');
html=html.replace(/<link\b[^>]*href="https:\/\/fonts\.[^"]*"[^>]*>/g,'');
html=html.replace('<link rel="stylesheet" href="style.css">','<link rel="stylesheet" href="fonts.css"><link rel="stylesheet" href="style.css"><script src="desktop-bootstrap.js"></script>');
// Desktop has no network-backed service worker or install prompt.
html=html.replace('<script src="pwa.js"></script>','');
fs.writeFileSync(path.join(web,'index.html'),html);
fs.copyFileSync(path.join(root,'bootstrap.js'),path.join(web,'desktop-bootstrap.js'));
console.log('Bundled editor and Japanese fonts; no hosted application required');
