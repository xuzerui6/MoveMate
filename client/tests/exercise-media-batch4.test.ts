import test from 'node:test';
import assert from 'node:assert/strict';
import {exercises} from '../../server/src/gym/model';
import approved from '../../scripts/exercise-media-approved.json';
import {mediaFor} from '../src/features/gym/mediaCatalogue';

const targets=['1373','1760','0042','1409','0336','3013','0047','0308','0375','0061','0333','1326','2330','0292','0406','2292','0274','0630','0475','0620'].map(id=>'exdb:'+id);
test('batch four has readable Chinese instructions and discoverable common aliases for all twenty targets',()=>{
  for(const id of targets){const e=exercises.find(e=>e.id===id)!;assert.ok(e);assert.ok(!/[a-z]/i.test(e.nameZh));assert.ok(e.instructions.length>=3&&e.instructions.length<=5);}
  for(const [q,id] of [['前蹲','0042'],['徒手提踵','1373'],['哑铃后踢','0333'],['反握引体','1326'],['仰卧举腿','0620']]){
    const e=exercises.find(e=>e.id==='exdb:'+id) as any;assert.ok([e.nameZh,...e.aliases].join(' ').includes(q));
  }
});
test('unmatched equipment, support and bent-leg variants stay without a false demonstration',()=>{
  for(const id of ['1373','1760','0375','0061','0292','2292','0475'])assert.notEqual(mediaFor('exdb:'+id)?.kind||(!mediaFor('exdb:'+id)?'missing':'photo'),'photo',id);
  assert.equal(mediaFor('user:0042'),undefined);
  assert.ok(mediaFor('exdb:0333')!.sources[0].name.includes('Standing_Bent-Over_Two-Arm'));
  assert.ok(mediaFor('exdb:2330')!.sources[0].name.includes('Wide-Grip_Lat_Pulldown'));
});
test('video attachments retain original public photos while keeping each new derivative site-only',()=>{
  for(const id of ['motion:squat','motion:push_up']){
    const m=mediaFor(id)!;assert.ok(m.video);assert.equal(m.video!.distribution,'site-only');
    assert.equal(m.images.filter(f=>f.distribution==='repository').length,2);
    assert.equal(m.images.filter(f=>f.distribution==='site-only').length,3);
    assert.ok(m.images.filter(f=>f.distribution==='site-only').every(f=>m.sources[f.sourceIndex!].license==='Pexels License'));
  }
});
test('all prior twenty-seven demonstration IDs survive, and new photos have actual stage labels',()=>{
  const old=[...approved.stills.filter(row=>!('review' in row)).map(row=>row.exerciseId),...approved.siteVideos.filter(row=>!('attachToExisting' in row)).flatMap(row=>row.exerciseIds)];
  assert.equal(new Set(old).size,27);for(const id of old)assert.ok(mediaFor(id));
  const added=targets.filter(id=>mediaFor(id)&&mediaFor(id)?.kind!=='illustration');assert.equal(added.length,13);
  for(const id of added)assert.ok(mediaFor(id)!.images.every(f=>f.phase&&!/^分解 \d+$/.test(f.phase)));
});
