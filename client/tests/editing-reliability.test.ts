import test from 'node:test';
import assert from 'node:assert/strict';
import {SnapshotEditor, changedFields, planSaveConfirmed, sameContent} from '../src/features/gym/editingState';
import {readDraft, writeDraft, removeDraft, validPlanDraft} from '../src/features/gym/draftStorage';
const plan = () => ({id:'a',version:1,name:'plan',mode:'weekly',rotationCursor:0,progression:{mode:'off'},routines:[{id:'day',name:'day',weekdays:[1],exercises:[{exerciseId:'motion:squat',sets:[{reps:10,seconds:0,loadKg:0,restSec:90}]}]}]});
const merge = (local:any, server:any) => ({...local,id:server.id,version:server.version});

test('a save acknowledges only the submitted revision and the next save uses its new version',async()=>{
  const e=new SnapshotEditor(plan());e.edit(p=>{p.name='first'});
  let release!:(v:any)=>void, sent:any;
  const saving=e.save(v=>{sent=v;return new Promise(r=>release=r)},async()=>plan(),planSaveConfirmed,merge);
  e.edit(p=>{p.name='second'});release({...sent,version:2});await saving;
  assert.equal(e.value.name,'second');assert.equal(e.value.version,2);assert.equal(e.dirty,true);
  await e.save(async v=>{assert.equal(v.version,2);return{...v,version:3}},async()=>plan(),planSaveConfirmed,merge);
  assert.equal(e.dirty,false);assert.equal(e.value.version,3);
});
test('a synchronous second save cannot send a competing request',async()=>{
  const e=new SnapshotEditor(plan());let calls=0,release!:(v:any)=>void;
  const send=async(v:any)=>{calls++;return new Promise<any>(r=>release=r)};
  const first=e.save(send,async()=>plan(),planSaveConfirmed,merge);
  assert.equal(await e.save(send,async()=>plan(),planSaveConfirmed,merge),false);
  release({...plan(),version:2});await first;assert.equal(calls,1);
});
test('lost committed response is read back, preserving edits made during the lookup',async()=>{
  const e=new SnapshotEditor(plan());e.edit(p=>{p.name='first'});let reads=0;
  await e.save(async v=>{e.edit(p=>{p.name='second'});throw Error('lost')},async()=>{reads++;return{...plan(),name:'first',version:2}},planSaveConfirmed,merge);
  assert.equal(reads,1);assert.equal(e.value.name,'second');assert.equal(e.value.version,2);assert.equal(e.uncertain,false);assert.equal(e.dirty,true);
});
test('uncertain retry first reads, then reuses the original snapshot rather than new input',async()=>{
  const e=new SnapshotEditor(plan());e.edit(p=>{p.name='first'});const bodies:any[]=[];
  await assert.rejects(e.save(async v=>{bodies.push(v);throw Error('network')},async()=>plan(),planSaveConfirmed,merge));
  e.edit(p=>{p.name='second'});let read=false;
  await e.save(async v=>{assert.ok(read);bodies.push(v);return{...v,version:2}},async()=>{read=true;return plan()},planSaveConfirmed,merge);
  assert.deepEqual(bodies[0],bodies[1]);assert.equal(e.value.name,'second');assert.equal(e.value.version,2);
});
test('a newer server version is a conflict, not permission to overwrite it',async()=>{
  const e=new SnapshotEditor(plan());e.edit(p=>{p.name='local'});let sends=0;
  await assert.rejects(e.save(async()=>{sends++;throw Error('lost')},async()=>{throw Error('offline')},planSaveConfirmed,merge));
  await assert.rejects(e.save(async()=>{sends++;return plan()},async()=>({...plan(),name:'other',version:5}),planSaveConfirmed,merge,(a,b)=>a.version!==b.version),/服务器版本已变化/);
  assert.equal(e.value.name,'local');assert.equal(e.dirty,true);assert.equal(sends,1);
});
test('a definitive validation rejection retains edits and unlocks saving',async()=>{
  const e=new SnapshotEditor(plan(),true);
  await assert.rejects(e.save(async()=>{throw{response:{status:400}}},async()=>plan(),planSaveConfirmed,merge));
  assert.equal(e.dirty,true);assert.equal(e.uncertain,false);assert.equal(e.busy,false);
});
test('cached state cannot confirm or discard an uncertain save',async()=>{
  const e=new SnapshotEditor(plan());
  await assert.rejects(e.save(async()=>{throw Error('lost')},async()=>({...plan(),version:2,__offline:true}),planSaveConfirmed,merge));
  await assert.rejects(e.save(async()=>plan(),async()=>({...plan(),version:2,__offline:true}),planSaveConfirmed,merge),/缓存/);
  assert.equal(e.uncertain,true);assert.equal(e.busy,false);
});
test('settings merge preserves server defaults and newer edits, including reverting a submitted field',async()=>{
  const base={unit:'kg',timeZone:'Asia/Shanghai',effort:'off',sound:false};
  const e=new SnapshotEditor(base);e.edit(v=>{v.unit='lb'});let release!:(v:any)=>void;
  const saving=e.save(v=>new Promise(r=>release=r),async()=>base,sameContent,(current,server,submitted)=>({...server,...changedFields(submitted,current)}));
  e.edit(v=>{v.unit='kg';v.effort='rpe'});release({...base,unit:'lb',sound:true});await saving;
  assert.deepEqual(e.value,{...base,sound:true,effort:'rpe'});assert.equal(e.dirty,true);
  assert.deepEqual(changedFields({...base,unit:'lb',sound:true},e.value),{unit:'kg',effort:'rpe'});
});
test('plan confirmation ignores key ordering but requires the matching committed version',()=>{
  const p=plan();assert.equal(planSaveConfirmed({...p,version:2},p),true);
  assert.equal(planSaveConfirmed({...p,version:1},p),false);assert.equal(planSaveConfirmed({...p,version:3},p),false);
  assert.equal(sameContent({a:1,b:2},{b:2,a:1}),true);
});
test('valid old drafts restore, damaged JSON and invalid shapes remain isolated',()=>{
  const m=new Map<string,string>(),store={getItem:(k:string)=>m.get(k)??null,setItem:(k:string,v:string)=>{m.set(k,v)},removeItem:(k:string)=>{m.delete(k)}};
  assert.equal(readDraft('one',validPlanDraft,store).state,'missing');
  assert.equal(writeDraft('one',plan(),store),true);assert.equal(readDraft('one',validPlanDraft,store).state,'valid');
  m.set('one','{broken');assert.equal(readDraft('one',validPlanDraft,store).state,'invalid');assert.equal(m.get('one'),'{broken');
  m.set('one',JSON.stringify({...plan(),routines:{}}));assert.equal(readDraft('one',validPlanDraft,store).state,'invalid');
  m.set('other-account','private');assert.equal(removeDraft('one',store),true);assert.equal(m.get('other-account'),'private');
});
test('quota, blocked reads and failed cleanup are reported without throwing away memory',()=>{
  const blocked={getItem:()=>{throw Error('blocked')},setItem:()=>{throw Error('quota')},removeItem:()=>{throw Error('blocked')}};
  const p=plan();assert.equal(readDraft('one',validPlanDraft,blocked).state,'unavailable');
  assert.equal(writeDraft('one',p,blocked),false);assert.equal(removeDraft('one',blocked),false);assert.equal(p.name,'plan');
});
