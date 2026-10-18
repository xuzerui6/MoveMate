import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { verifyExerciseMedia, installExerciseMedia } from '../../scripts/exercise-media-assets.mjs';

const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
function fixture(t:any){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'movemate-media-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const root=path.join(dir,'repo'),mediaDir=path.join(dir,'licensed');
  fs.mkdirSync(root,{recursive:true});fs.mkdirSync(mediaDir,{recursive:true});
  const file=(name:string,distribution:string)=>{
    const bytes=Buffer.from(name.repeat(200)),sha256=hash(bytes),src=`/exercise-media/${name}.${sha256.slice(0,12)}.webp`;
    const f=path.join(distribution==='site-only'?mediaDir:path.join(root,'client/public'),src);
    fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,bytes);
    return {src,sha256,bytes:bytes.length,distribution};
  };
  const publicFile=file('public','repository'),siteFile=file('site-private','site-only');
  const raw=Buffer.from('original-private-source'.repeat(100));
  const manifest={entries:{'test:exact':{images:[publicFile,siteFile],sources:[{distribution:'site-only',sourceSha256:[hash(raw)]}]}}};
  const opts={root,mediaDir,manifest,trackedPaths:[]};
  return{dir,root,mediaDir,publicFile,siteFile,raw,manifest,opts};
}
test('mixed media is verified; only site-only files are copied into build output',t=>{
  const f=fixture(t),out=path.join(f.dir,'out');
  assert.equal(installExerciseMedia(out,f.opts),2);
  assert.equal(hash(fs.readFileSync(path.join(out,f.siteFile.src))),f.siteFile.sha256);
  assert.ok(!fs.existsSync(path.join(out,f.publicFile.src)),'Vite already handles public assets');
});
test('missing directory/file or corrupt bytes stop before output is written',t=>{
  const f=fixture(t),out=path.join(f.dir,'out');
  assert.throws(()=>verifyExerciseMedia({...f.opts,mediaDir:''}),/MOVEMATE_MEDIA_DIR/);
  const p=path.join(f.mediaDir,f.siteFile.src);fs.writeFileSync(p,'changed bytes');
  assert.throws(()=>installExerciseMedia(out,f.opts),/checksum/);assert.ok(!fs.existsSync(out));
  fs.unlinkSync(p);assert.throws(()=>verifyExerciseMedia(f.opts),/Missing reviewed media/);
});
test('inside-repository storage, path traversal and misplaced public copies are rejected',t=>{
  const f=fixture(t),inside=path.join(f.root,'private');fs.mkdirSync(inside);
  assert.throws(()=>verifyExerciseMedia({...f.opts,mediaDir:inside}),/outside/);
  const bad=structuredClone(f.manifest);bad.entries['test:exact'].images[1].src='/exercise-media/../secret.webp';
  assert.throws(()=>verifyExerciseMedia({...f.opts,manifest:bad}),/Invalid reviewed media path/);
  const copied=path.join(f.root,'client/public',f.siteFile.src);fs.mkdirSync(path.dirname(copied),{recursive:true});fs.copyFileSync(path.join(f.mediaDir,f.siteFile.src),copied);
  assert.throws(()=>verifyExerciseMedia(f.opts),/client\/public/);
});
test('restricted originals and derivatives are rejected under renamed tracked paths',t=>{
  const f=fixture(t),file=path.join(f.root,'innocent.jpg');fs.writeFileSync(file,f.raw);
  assert.throws(()=>verifyExerciseMedia({...f.opts,trackedPaths:['innocent.jpg']}),/tracked by Git/);
  fs.copyFileSync(path.join(f.mediaDir,f.siteFile.src),file);
  assert.throws(()=>verifyExerciseMedia({...f.opts,trackedPaths:['innocent.jpg']}),/tracked by Git/);
});
test('staged private bytes are caught even after the working file is replaced',t=>{
  const f=fixture(t);execFileSync('git',['init','-q'],{cwd:f.root});
  const file=path.join(f.root,'disguised.jpg');fs.writeFileSync(file,f.raw);execFileSync('git',['add','disguised.jpg'],{cwd:f.root});
  fs.writeFileSync(file,'now harmless working file');
  const {trackedPaths,...opts}=f.opts;
  assert.throws(()=>verifyExerciseMedia(opts),/staged in Git/);
});
