// Optional authoring tool, not a build-time dependency. Never downloads browsers.
// MOVEMATE_PLAYWRIGHT_MODULE may point at an already installed Playwright module.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const output=process.argv[2]&&path.resolve(process.argv[2]);
const relative=output&&path.relative(root,output);
if(!output||relative===''||(!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative)))throw Error('Render output must be an explicit directory outside the repository');
const {chromium}=require(process.env.MOVEMATE_PLAYWRIGHT_MODULE||'playwright');
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
(async()=>{
  fs.mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
  try{
    const page=await browser.newPage({viewport:{width:600,height:600},deviceScaleFactor:1});
    const renders=[];
    for(const name of fs.readdirSync(path.join(root,'assets/exercise-illustrations')).filter(n=>n.endsWith('.svg')).sort()){
      const svg=fs.readFileSync(path.join(root,'assets/exercise-illustrations',name));
      await page.setContent('<style>html,body{margin:0}</style>'+svg.toString());
      const png=await page.screenshot({path:path.join(output,name.replace('.svg','.png'))});
      renders.push({svg:name,sourceSha256:hash(svg),png:name.replace('.svg','.png'),sha256:hash(png)});
    }
    fs.writeFileSync(path.join(output,'render-manifest.json'),JSON.stringify({browser:browser.version(),viewport:[600,600],renders},null,2)+'\n');
    console.log('Rendered original SVG phases:',renders.length);
  }finally{await browser.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
