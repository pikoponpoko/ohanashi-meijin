async function downloadPdf(){
  if(!window.htmlToImage||!window.jspdf)throw Error('PDF libraries unavailable');
  toast('PDFを作成しています…');
  const root=$('#printRoot');root.classList.add('pdf-render');
  try{
    await document.fonts.ready;
    const pages=[...root.children];
    const fontEmbedCSS=await htmlToImage.getFontEmbedCSS(root);
    if(!fontEmbedCSS.includes('data:')||!fontEmbedCSS.includes(state.font))throw Error('選択したフォントをPDFに埋め込めません。通信を確認して再試行してください。');
    const pdf=new jspdf.jsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true});
    pdf.setProperties({title:state.title,author:state.author});
    for(let i=0;i<pages.length;i++){
      const canvas=await htmlToImage.toCanvas(pages[i],{pixelRatio:3,backgroundColor:'#ffffff',fontEmbedCSS});
      if(i)pdf.addPage('a4','landscape');
      pdf.addImage(canvas.toDataURL('image/png'),'PNG',0,0,297,210,undefined,'FAST');
      canvas.width=canvas.height=0;
    }
    download(pdf.output('arraybuffer'),'pdf','application/pdf');toast('PDFを保存しました');
  }finally{root.classList.remove('pdf-render')}
}
