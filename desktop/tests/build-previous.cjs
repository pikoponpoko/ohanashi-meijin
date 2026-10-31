// The previous version for the installer upgrade test: the app as released before the rename
// (おはなし名人 / OhanashiMeijin.exe, the same appId), version 0.0.9.
const builder=require('electron-builder');
const pkg=require('../package.json');
const old={productName:'OhanashiMeijin',artifactName:'OhanashiMeijin-${version}-${arch}-Setup.${ext}'};
builder.build({
 projectDir:require('node:path').resolve(__dirname,'..'),
 targets:builder.Platform.WINDOWS.createTarget('nsis',builder.Arch.x64),
 publish:'never',
 config:{...pkg.build,...old,nsis:{...pkg.build.nsis,shortcutName:'おはなし名人'},extraMetadata:{version:'0.0.9',productName:old.productName}},
}).then(()=>console.log('previous version built'),e=>{console.error(e);process.exit(1)});
