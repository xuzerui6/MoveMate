import test from 'node:test';
import assert from 'node:assert/strict';
import {recoveryDraft,restoreFields,readRecoveryDraft,archiveDraft,archivedDrafts,forgetDraft} from '../src/features/gym/recoveryDrafts';
import {WorkoutRecoveryStorage,getWorkoutRecoveryStorage,clearWorkoutRecoveryStorage,checkpointUpdate} from '../src/features/gym/workoutRecoveryStorage';
import {WorkoutSync} from '../src/features/gym/workoutSync';
const settings={unit:'kg',timeZone:'Asia/Shanghai',effort:'off',equipment:['dumbbell'],plates:[{kg:5,count:2}]};
const memory=()=>{const data=new Map<string,string>();return{data,getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v)},removeItem:(k:string)=>{data.delete(k)}};};
const operation=()=>({operationId:crypto.randomUUID(),version:1,action:'pause',setId:'one',reps:4,score:{count:4,total:350}});
test('settings recovery keeps unrelated server changes and restores only edited fields',()=>{
  const d=recoveryDraft(settings,{...settings,effort:'rpe'});
  const restored=restoreFields({...settings,unit:'lb'},d);
  assert.deepEqual(restored.conflicts,[]);assert.equal(restored.value.unit,'lb');assert.equal(restored.value.effort,'rpe');
});
test('same-field changes are conflicts while arrays are whole-field choices',()=>{
  const d=recoveryDraft(settings,{...settings,effort:'rpe',equipment:['barbell']});
  const r=restoreFields({...settings,effort:'rir',equipment:['cable']},d);
  assert.deepEqual(r.conflicts,['effort','equipment']);assert.equal(r.value.effort,'rir');assert.deepEqual(r.value.equipment,['cable']);
});
test('legacy settings never auto-restore any differing field',()=>{
  const r=restoreFields({...settings,unit:'lb'},recoveryDraft(null,{...settings,effort:'rpe'}));
  assert.deepEqual(r.conflicts,['unit','effort']);assert.equal(r.value.unit,'lb');assert.equal(r.value.effort,'off');
});
test('server already containing the edited value is not a conflict',()=>{
  const r=restoreFields({...settings,effort:'rpe'},recoveryDraft(settings,{...settings,effort:'rpe'}));assert.deepEqual(r.conflicts,[]);
});
test('versioned and legacy drafts read without deleting malformed content',()=>{
  const store=memory(),previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:store});
  try{
    const valid=(v:any)=>!!v&&typeof v.unit==='string';
    store.setItem('draft',JSON.stringify(settings));assert.equal(readRecoveryDraft('draft',valid).value?.base,null);
    store.setItem('draft',JSON.stringify(recoveryDraft(settings,{...settings,effort:'rpe'})));assert.equal(readRecoveryDraft('draft',valid).value?.base.unit,'kg');
    store.setItem('broken','{bad');assert.equal(readRecoveryDraft('broken',valid).state,'invalid');assert.equal(store.getItem('broken'),'{bad');
  }finally{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete(globalThis as any).localStorage;}
});
test('conflicts archive separately, deduplicate, and delete only the acknowledged original',()=>{
  const store=memory(),previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');Object.defineProperty(globalThis,'localStorage',{configurable:true,value:store});
  try{const valid=(v:any)=>!!v&&typeof v.unit==='string';const a=recoveryDraft(settings,{...settings,effort:'rpe'}),b=recoveryDraft(settings,{...settings,unit:'lb'});
    store.setItem('draft','original');assert.equal(archiveDraft('draft',a,valid),true);archiveDraft('draft',a,valid);archiveDraft('draft',b,valid);
    assert.equal(store.getItem('draft'),'original');assert.equal(archivedDrafts('draft',valid).value?.length,2);forgetDraft('draft',a,valid);assert.deepEqual(archivedDrafts('draft',valid).value,[b]);
    store.setItem('draft:conflicts','{bad');assert.equal(archiveDraft('draft',a,valid),false);assert.equal(store.getItem('draft'),'original');
  }finally{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete(globalThis as any).localStorage;}
});
test('quota failure retains an immutable pending snapshot in memory',()=>{
  const store=memory();store.setItem=()=>{throw Error('quota')};const r=new WorkoutRecoveryStorage('one',store),body=operation();
  r.setPending(body);body.reps=99;body.score.total=0;r.setNetwork(1);
  assert.equal(r.getPending().reps,4);assert.equal(r.getPending().score.total,350);assert.equal(r.network,1);assert.match(r.warning,/请勿刷新或关闭/);
});
test('blocked reads and corrupt records require a fresh read before any operation',()=>{
  for(const value of ['{bad',JSON.stringify({action:'pause',operationId:'invalid',version:1})]){
    const store=memory();store.setItem('one',value);const r=new WorkoutRecoveryStorage('one',store);
    assert.equal(r.blocked,true);assert.throws(()=>r.getPending(),/尚未核对/);r.acknowledgeRead();assert.equal(r.unknown,false);assert.equal(r.getPending(),null);
  }
  const r=new WorkoutRecoveryStorage('one',{getItem:()=>{throw Error('blocked')},setItem:()=>{},removeItem:()=>{}});assert.equal(r.unknown,true);
});
test('failed cleanup uses the in-memory tombstone instead of replaying an old disk operation',()=>{
  const store=memory(),body=operation();store.setItem('one',JSON.stringify(body));store.removeItem=()=>{throw Error('blocked')};const r=new WorkoutRecoveryStorage('one',store);
  r.setPending(null);assert.equal(r.getPending(),null);assert.ok(store.getItem('one'));assert.match(r.warning,/未能保存/);
});
test('a damaged network marker cannot discard a readable original operation after server reconciliation',()=>{
  const store=memory(),body=operation();store.setItem('one',JSON.stringify(body));store.setItem('one:network','broken');
  const r=new WorkoutRecoveryStorage('one',store);assert.equal(r.unknown,true);assert.deepEqual(r.pending,body);
  r.setPending({...body,version:2});r.acknowledgeRead();assert.equal(r.getPending().operationId,body.operationId);assert.equal(r.getPending().version,2);
  const snapshot={setId:'one',values:{reps:4}};store.setItem('one:snapshot',JSON.stringify(snapshot));
  const get=store.getItem;store.getItem=k=>{if(k.endsWith(':network'))throw Error('blocked marker');return get(k)};
  const partial=new WorkoutRecoveryStorage('one',store);assert.equal(partial.unknown,true);assert.equal(partial.pending.operationId,body.operationId);assert.deepEqual(partial.checkpoint,snapshot);
});
test('memory-only finish retries the same operation after reading, and never re-awards a finished record',async()=>{
  const store=memory();store.setItem=()=>{throw Error('quota')};const cache=new WorkoutRecoveryStorage('one',store);
  const row={id:'w',phase:'working',version:1,cursor:0,sets:[{id:'one'}]};let fail=true;const bodies:any[]=[];
  const q=new WorkoutSync(row,async body=>{bodies.push(structuredClone(body));if(fail)throw Error('lost');return{...row,phase:'finished',version:2}},async()=>row,{get:()=>cache.getPending(),set:v=>cache.setPending(v)},()=>{});
  await assert.rejects(q.finish({reps:4}));fail=false;await q.finish({reps:99});assert.deepEqual(bodies[0],bodies[1]);await q.finish();assert.equal(bodies.length,2);
});
test('account cleanup invalidates old instances and isolates other accounts and workouts',()=>{
  const store=memory(),a=getWorkoutRecoveryStorage('user-a','w',store),b=getWorkoutRecoveryStorage('user-b','w',store),other=getWorkoutRecoveryStorage('user-a','other',store);
  a.setPending(operation());b.setPending(operation());other.setPending(operation());clearWorkoutRecoveryStorage('user-a');
  assert.throws(()=>a.getPending(),/会话已结束/);a.setPending(operation());assert.throws(()=>other.getPending());assert.ok(b.getPending());
  assert.notEqual(getWorkoutRecoveryStorage('user-a','w',store),a);clearWorkoutRecoveryStorage('user-a');clearWorkoutRecoveryStorage('user-b');
});
test('a newer camera snapshot survives an in-flight immutable progress operation and cannot move to another set',async()=>{
  const store=memory();store.setItem=()=>{throw Error('quota')};const r=new WorkoutRecoveryStorage('one',store);
  const first={...operation(),action:'progress',reps:2};r.setPending(first);r.setCheckpoint({setId:'one',values:{reps:4,score:{count:4,total:350}}});
  assert.equal(r.getPending().reps,2);assert.equal(r.checkpoint?.values.reps,4);
  const row={phase:'paused',cursor:0,sets:[{id:'one',inputMode:'camera',reps:2}]};const patch=checkpointUpdate(r.checkpoint,row);assert.equal(patch?.reps,4);
  assert.equal(checkpointUpdate(r.checkpoint,{...row,sets:[{...row.sets[0],reps:5}]}),null);
  assert.throws(()=>checkpointUpdate(r.checkpoint,{...row,sets:[{id:'another'}]}),/本组/);
  assert.throws(()=>checkpointUpdate(r.checkpoint,{...row,phase:'finished'}),/本组/);
  r.setPending(null);assert.equal(r.blocked,true);r.setCheckpoint(null);assert.equal(r.blocked,false);
});
