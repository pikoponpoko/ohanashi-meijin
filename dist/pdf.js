// Embed only the subsets of the fonts the print pages use that cover the printed text.
// Embedding every web-font subset meant hundreds of downloads, and one failure aborted the PDF.
function inUnicodeRange(range,codes){
  return range.split(',').some(part=>{
    const [a,b]=part.trim().replace(/^U\+/i,'').split('-');
    const low=parseInt(a.replace(/\?/g,'0'),16),high=parseInt((b||a).replace(/\?/g,'F'),16);
    return codes.some(c=>c>=low&&c<=high);
  });
}
const fontData=new Map();
function fontDataURL(url){
  if(!fontData.has(url))fontData.set(url,fetchFontData(url).catch(error=>{fontData.delete(url);throw error}));
  return fontData.get(url);
}
async function fetchFontData(url){
  for(let attempt=0;;attempt++){
    try{
      const response=await fetch(url);if(!response.ok)throw Error(response.status);
      const blob=await response.blob();
      return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob)});
    }catch(error){if(attempt>=2)throw error;await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)))}
  }
}
async function usedFontCSS(root){
  const codes=[...new Set(Array.from(root.textContent+'0123456789',c=>c.codePointAt(0)))];
  const families=new Set([state.font.toLowerCase()]),rules=[];
  for(const element of [root,...root.querySelectorAll('*')])for(const name of getComputedStyle(element).fontFamily.split(','))families.add(name.replace(/["']/g,'').trim().toLowerCase());
  for(const sheet of document.styleSheets){
    let list;try{list=sheet.cssRules}catch(_){continue}
    for(const rule of list){
      if(!(rule instanceof CSSFontFaceRule))continue;
      if(!families.has(rule.style.getPropertyValue('font-family').replace(/["']/g,'').trim().toLowerCase()))continue;
      const range=rule.style.getPropertyValue('unicode-range');
      if(range&&!inUnicodeRange(range,codes))continue;
      rules.push({rule,base:sheet.href||location.href});
    }
  }
  const css=await Promise.all(rules.map(async({rule,base})=>{
    let text=rule.cssText;
    for(const match of [...text.matchAll(/url\(["']?([^"')]+)["']?\)/g)]){
      if(match[1].startsWith('data:'))continue;
      text=text.replace(match[0],'url('+await fontDataURL(new URL(match[1],base).href)+')');
    }
    return text;
  }));
  return css.join('\n');
}
async function downloadPdf(){
  if(!window.htmlToImage||!window.jspdf)throw Error('PDF libraries unavailable');
  toast('PDFを作成しています…');
  const root=$('#printRoot');root.classList.add('pdf-render');
  try{
    await document.fonts.ready;
    const pages=[...root.children];
    const pdf=new jspdf.jsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true});
    pdf.setProperties({title:state.title,author:state.author});
    for(let i=0;i<pages.length;i++){
      let fontEmbedCSS;try{fontEmbedCSS=await usedFontCSS(pages[i])}catch(_){fontEmbedCSS=''}
      if(!fontEmbedCSS.includes('data:')||!fontEmbedCSS.includes(state.font))throw Error('選択したフォントをPDFに埋め込めません。通信を確認して再試行してください。');
      const canvas=await htmlToImage.toCanvas(pages[i],{pixelRatio:3,backgroundColor:'#ffffff',fontEmbedCSS});
      if(i)pdf.addPage('a4','landscape');
      pdf.addImage(canvas.toDataURL('image/png'),'PNG',0,0,297,210,undefined,'FAST');
      canvas.width=canvas.height=0;
    }
    download(pdf.output('arraybuffer'),'pdf','application/pdf');toast('PDFを保存しました');
  }finally{root.classList.remove('pdf-render')}
}
