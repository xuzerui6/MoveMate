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
import approved from '../../scripts/exercise-media-approved.json';
import {exerciseMedia,mediaFor} from '../src/features/gym/mediaCatalogue';
import {mediaIndex,muscleRegions} from '../src/features/gym/media';
import musclePaths from '../src/features/gym/muscle-paths.json';
import {reviewedMediaIds} from '../../server/src/gym/media-filter';
import {verifyMediaMetadata} from '../../scripts/media-metadata.mjs';
import {loadMedia} from '../src/features/gym/mediaLoader';
const root=path.resolve(import.meta.dirname,'../..');

test('every official ID has an honest separate documentation decision; custom IDs cannot inherit it',()=>{
  execFileSync(process.execPath,[path.join(root,'scripts/publish-exercise-documentation.mjs'),'--check']);
  assert.equal(exercises.length,1329);assert.equal(ledger.total,1329);
  assert.deepEqual(new Set(exercises.map(e=>e.id)),new Set(ledger.entries.map(e=>e.id)));
  assert.ok(ledger.entries.every(e=>e.reviewStage==='editorial'),'Every current official ID was individually source-compared; structural placeholders do not count');
  for(const e of exercises){
    assert.ok(e.nameZh&&e.aliases?.includes(e.name),e.id+' must retain a Chinese title and its original searchable name');
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
  assert.equal(exercises.find(e=>e.id==='exdb:1371')!.reviewStatus,'checked');
  assert.deepEqual(mediaFor('exdb:1371')!.images,mediaFor('exdb:0088')!.images,'Individually verified same forms retain both IDs without fabricating another shoot');
  assert.equal(exercises.find(e=>e.id==='exdb:0475')!.category,'strength','Straight leg raises are repetitions, not a static hang');
  for(const id of ['exdb:1297','exdb:1403'])assert.equal(exercises.find(e=>e.id===id)!.category,'timed','Static holds must not be described as repetition cycles');
  assert.equal(exercises.find(e=>e.id==='exdb:0484')!.reviewStage,'editorial');
  assert.ok(exercises.find(e=>e.id==='exdb:0484')!.form!.includes('双脚悬空'));
  assert.ok(exercises.find(e=>e.id==='exdb:0484')!.instructions.some(s=>s.includes('骨盆')));
});

test('alternating illustrations show both sides and mark only the moving side',()=>{
  for(const id of ['exdb:0388','exdb:0414','exdb:0415','exdb:0387','exdb:1648','exdb:1730','exdb:1739']){
    const recipe=diagrams.entries[id] as {phasePoseIndices:number[];poseArrows:number[][][]};
    assert.deepEqual(recipe.phasePoseIndices,[0,1,0,2,0]);
    assert.equal(recipe.poseArrows[1].length,1);assert.equal(recipe.poseArrows[2].length,1);
    for(const stage of [1,3]){
      const svg=fs.readFileSync(path.join(root,'assets/exercise-illustrations',id.replace(':','-')+'-'+stage+'.svg'),'utf8');
      assert.equal((svg.match(/marker-end=/g)||[]).length,1);
    }
    assert.equal(mediaFor(id)?.video,undefined,'Five still frames must never be presented as a continuous video');
    assert.equal(exercises.find(e=>e.id===id)!.planCamera,undefined);
  }
});

test('photo order uses each approved source once and labels actual phases without inventing mirrored sides',()=>{
  for(const row of approved.stills as any[]){
    if(!row.imageOrder)continue;
    assert.deepEqual([...row.imageOrder].sort(),row.sourceSha256.map((_:any,i:number)=>i));
    const media=mediaFor(row.exerciseId)!;
    const sourceIndex=media.sources.findIndex(s=>s.name==='free-exercise-db / '+row.sourceId);
    assert.ok(sourceIndex>=0);
    const photos=media.images.filter(f=>f.sourceIndex===sourceIndex);
    assert.deepEqual(photos.map(f=>f.phase),row.phases);
    assert.ok(media.sources[sourceIndex].changes.includes('未镜像'));
    for(let i=0;i<photos.length;i++)assert.ok(photos[i].src.includes(row.sourceId.toLowerCase()+'-'+row.imageOrder[i]+'.'));
  }
});

test('exact muscle aliases highlight existing shapes, while missing outlines never borrow another muscle',()=>{
  assert.deepEqual(muscleRegions('quads'),muscleRegions('quadriceps'));
  assert.deepEqual(muscleRegions('deltoids'),muscleRegions('delts'));
  assert.deepEqual(muscleRegions('trapezius'),muscleRegions('traps'));
  assert.deepEqual(muscleRegions('latissimus dorsi'),[]);
  assert.deepEqual(muscleRegions('levator scapulae'),[]);
  const known=new Set([...musclePaths.front,...musclePaths.back].map(p=>p.muscle));
  for(const e of exercises)for(const target of [e.target,...e.secondaryMuscles])for(const region of muscleRegions(target))assert.ok(known.has(region),target+' -> '+region);
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
    assert.equal(m.images.length,recipe.phases.length);
    const sequence=(recipe as {phasePoseIndices?:number[]}).phasePoseIndices||[0,1,0];
    assert.equal(sequence.length,recipe.phases.length);
    assert.ok(sequence.every(n=>Number.isInteger(n)&&n>=0&&n<recipe.poses.length));
    assert.deepEqual(m.images.map(i=>i.phase),recipe.phases);
    for(let i=0;i<m.images.length;i++){
      const svg=fs.readFileSync(path.join(root,'assets/exercise-illustrations',id.replace(':','-')+'-'+i+'.svg'));
      assert.equal(createHash('sha256').update(svg).digest('hex'),m.sources[0].sourceSha256![i]);
      assert.ok(!svg.toString().includes('<image'),'No borrowed or embedded media');
      const image=fs.readFileSync(path.join(root,'client/public',m.images[i].src));
      assert.equal(createHash('sha256').update(image).digest('hex'),m.images[i].sha256);
    }
    assert.equal(m.sources[0].license,'MIT');
  }
});

test('an explicitly matched shared demonstration never grants another ID camera or source ownership',()=>{
  const example=exercises.find(e=>e.id==='exdb:3224')!;
  assert.equal(example.cameraType,undefined);assert.equal(example.planCamera,undefined);
  const existing=mediaFor('motion:jumping_jack')!,matched=mediaFor(example.id)!;
  assert.deepEqual(matched.video,existing.video);
  assert.deepEqual(matched.sources,existing.sources);
  assert.ok(matched.images.every(f=>f.distribution==='site-only'));
  const paired=diagrams.entries['exdb:3636'];
  assert.deepEqual(paired.phasePoseIndices,[0,1,0,2,0]);
  assert.equal(new Set(paired.phases).size,5);
  assert.notDeepEqual(paired.poses[1].legs,paired.poses[2].legs);
});

test('corrected pull-up phases cover the actual ascent and return without changing the released video',()=>{
  const m=mediaFor('exdb:0652')!;
  assert.deepEqual(m.images.map(f=>f.sourceTime),[1,3.5,5.5]);
  assert.equal(m.video!.sha256,'28f8dad6ffdb8c63c2bc93062a00f505e4ce6dfd60e8fd55afc347cf4b409263');
  assert.deepEqual(mediaFor('exdb:1429')!.video,m.video);
  assert.equal(exercises.find(e=>e.id==='exdb:1429')!.planCamera,undefined);
  for(const image of m.images)assert.equal(m.sources[image.sourceIndex!].license,'CC BY-SA 4.0');
  for(const id of ['exdb:0643','exdb:0669']){
    assert.equal(exercises.find(e=>e.id===id)!.category,'timed');
    const relax=fs.readFileSync(path.join(root,'assets/exercise-illustrations',id.replace(':','-')+'-2.svg'),'utf8');
    assert.ok(!relax.includes('marker-end='),'Resting poses must not keep a movement arrow');
  }
});

test('independent references correct specific source errors, retain licenses and leave unresolved anatomy unapproved',()=>{
  for(const id of ['exdb:0050','exdb:0098','exdb:0137','exdb:0870','exdb:0173','exdb:0873','exdb:0328','exdb:0260','exdb:0484','exdb:0500','exdb:3194','exdb:0118','exdb:0436']){
    const exercise=exercises.find(e=>e.id===id)!;
    assert.equal(exercise.reviewStatus,'checked');assert.ok(mediaFor(id)?.images.length);
    const entry=ledger.entries.find(e=>e.id===id)!;
    const sources=(entry.text as {editorialSources?:{license:string;sourceRecordSha256:string}[]}).editorialSources!;
    assert.equal(sources.length,1);assert.equal(sources[0].license,'Unlicense');
    assert.match(sources[0].sourceRecordSha256,/^[a-f0-9]{64}$/);
    assert.ok(!('textSources' in exercise),'Full reference records belong in the audit, not every API row');
  }
  assert.ok(exercises.find(e=>e.id==='exdb:0137')!.instructions.some(s=>s.includes('前臂')));
  assert.ok(!exercises.find(e=>e.id==='exdb:0870')!.instructions.join('').includes('仰卧'));
  assert.ok(exercises.find(e=>e.id==='exdb:0873')!.instructions.some(s=>s.includes('踝带')));
  for(const id of ['exdb:0347','exdb:0349'])assert.equal(exercises.find(e=>e.id===id)!.reviewStatus,'needs_review');
  assert.equal(exercises.find(e=>e.id==='exdb:0500')!.category,'strength');
  assert.ok(exercises.find(e=>e.id==='exdb:0500')!.form!.includes('掌撑'));
  assert.ok(exercises.find(e=>e.id==='exdb:0436')!.form!.includes('平凳仰卧'));
  assert.equal(mediaFor('exdb:0332')!.kind,'illustration','The squat-and-raise photo must not replace this source’s standing lateral raise');
  assert.equal(mediaFor('exdb:0433')!.kind,'illustration','Cross-bench shoulder support must not replace this source’s full-length bench support');
  assert.equal(diagrams.entries['exdb:0660'].props.filter(p=>typeof p==='object'&&p.type==='dumbbell').length,2,'Two separate dumbbells must not be replaced by the upright single-dumbbell photo');
});
