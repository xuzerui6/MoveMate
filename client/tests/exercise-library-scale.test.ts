import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {exercises} from '../../server/src/gym/model';
import {documented} from '../../server/src/gym/documentation';
import ledger from '../../docs/exercise-audit-ledger.json';
import diagrams from '../../scripts/exercise-illustrations.json';
import {exerciseMedia,mediaFor} from '../src/features/gym/mediaCatalogue';
import {mediaIndex} from '../src/features/gym/media';
import {reviewedMediaIds} from '../../server/src/gym/media-filter';
import {verifyMediaMetadata} from '../../scripts/media-metadata.mjs';
import {loadMedia} from '../src/features/gym/mediaLoader';
const root=path.resolve(import.meta.dirname,'../..');

test('every official ID has an honest separate documentation decision; custom IDs cannot inherit it',()=>{
  execFileSync(process.execPath,[path.join(root,'scripts/publish-exercise-documentation.mjs'),'--check']);
  assert.equal(exercises.length,1329);assert.equal(ledger.total,1329);
  assert.deepEqual(new Set(exercises.map(e=>e.id)),new Set(ledger.entries.map(e=>e.id)));
  for(const e of exercises){
    assert.ok(e.reviewReason,e.id);
    if(e.reviewStatus==='checked'){
      assert.ok(e.instructions.length>=3&&e.instructions.length<=5,e.id);
      assert.ok(e.form&&e.cues?.length,e.id);assert.ok(mediaFor(e.id)?.images.length,e.id);
    }else assert.equal(e.reviewStatus,'needs_review');
  }
  const source=exercises.find(e=>e.id==='exdb:1760')!;
  assert.equal(documented({...source,id:'user:1760',reviewStatus:undefined}).reviewStatus,'needs_review');
  assert.ok(!mediaFor('user:1760'));
  assert.ok(exercises.some(e=>e.id==='exdb:0088'));assert.ok(exercises.some(e=>e.id==='exdb:1371'));
  assert.equal(exercises.find(e=>e.id==='exdb:1371')!.reviewStatus,'needs_review');
  assert.equal(mediaFor('exdb:1371'),undefined);
  assert.equal(exercises.find(e=>e.id==='exdb:0475')!.category,'strength','Straight leg raises are repetitions, not a static hang');
});

test('media filtering remains complete beyond 500 entries and composes before paging',()=>{
  const synthetic=Object.fromEntries(Array.from({length:1120},(_,i)=>['source:'+i,{images:i%9?3:0,video:i%5===0}]));
  const selected=reviewedMediaIds('images',synthetic)!;assert.ok(selected.size>500);
  const all=Object.keys(synthetic).map((id,i)=>({id,muscle:i%3?'chest':'legs',favorite:i%7===0}));
  const expected=all.filter(e=>synthetic[e.id].images>0&&e.muscle==='chest'&&e.favorite);
  const filtered=all.filter(e=>selected.has(e.id)&&e.muscle==='chest'&&e.favorite);
  const pages=[];for(let cursor=0;cursor<filtered.length;cursor+=24)pages.push(...filtered.slice(cursor,cursor+24));
  assert.deepEqual(pages,expected);assert.equal(new Set(pages.map(e=>e.id)).size,pages.length);
  assert.equal(reviewedMediaIds(undefined),null);assert.throws(()=>reviewedMediaIds('photo'));
  assert.deepEqual([...reviewedMediaIds('video',synthetic)!],Object.keys(synthetic).filter(id=>synthetic[id].video));
  const ui=fs.readFileSync(path.join(root,'client/src/features/gym/Library.tsx'),'utf8');
  assert.ok(ui.includes('{media:demoFilter}'));assert.ok(!ui.includes('mediaIds(demoFilter)'));
});

test('lazy immutable records match the lightweight index; app imports no full attribution manifest',()=>{
  const manifest={entries:exerciseMedia};assert.equal(verifyMediaMetadata(root,manifest),Object.keys(mediaIndex).length);
  assert.throws(()=>verifyMediaMetadata(root,{entries:{...exerciseMedia,'user:1760':exerciseMedia['exdb:1760']}}),/count/);
  for(const file of ['Library.tsx','ExerciseMedia.tsx','media.ts','mediaLoader.ts']){
    const text=fs.readFileSync(path.join(root,'client/src/features/gym',file),'utf8');
    assert.ok(!text.includes('mediaCatalogue'),file);assert.ok(!text.includes("'./exercise-media.json'"),file);
  }
  assert.ok(fs.readFileSync(path.join(root,'client/public/sw.js'),'utf8').includes('MEDIA_DETAIL'));
});

test('lazy media failures retry, overlapping reads deduplicate, and a mismatched ID never enters cache',async()=>{
  const saved=globalThis.fetch;let calls=0;
  const id='exdb:1760';
  try{
    globalThis.fetch=async()=>{calls++;return new Response('unavailable',{status:503});};
    await assert.rejects(loadMedia(id));assert.equal(calls,1);
    globalThis.fetch=async()=>{calls++;return Response.json({exerciseId:'user:1760',...exerciseMedia[id]});};
    await assert.rejects(loadMedia(id),/不一致/);assert.equal(calls,2);
    let done:(r:Response)=>void=()=>{};
    globalThis.fetch=()=>{calls++;return new Promise<Response>(r=>done=r);};
    const a=loadMedia(id),b=loadMedia(id);assert.equal(calls,3);
    done(Response.json({exerciseId:id,...exerciseMedia[id]}));
    assert.deepEqual(await a,await b);await loadMedia(id);assert.equal(calls,3);
  }finally{globalThis.fetch=saved;}
});

test('original diagrams have explicit poses, original SVG hashes, a separate media kind and no fake video',()=>{
  for(const [id,recipe]of Object.entries(diagrams.entries)){
    const m=exerciseMedia[id];assert.equal(m.kind,'illustration');assert.equal(m.video,undefined);
    assert.equal(m.images.length,3);assert.equal(recipe.poses.length,2);
    assert.deepEqual(m.images.map(i=>i.phase),recipe.phases);
    for(let i=0;i<3;i++){
      const svg=fs.readFileSync(path.join(root,'assets/exercise-illustrations',id.replace(':','-')+'-'+i+'.svg'));
      assert.equal(createHash('sha256').update(svg).digest('hex'),m.sources[0].sourceSha256![i]);
      assert.ok(!svg.toString().includes('<image'),'No borrowed or embedded media');
      const image=fs.readFileSync(path.join(root,'client/public',m.images[i].src));
      assert.equal(createHash('sha256').update(image).digest('hex'),m.images[i].sha256);
    }
    assert.equal(m.sources[0].license,'MIT');
  }
});
