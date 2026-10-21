import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {WorkoutSync} from '../src/features/gym/workoutSync';
import {FavoriteRequests, mergeExercisePage} from '../src/features/gym/libraryState';
import {todayPlanState, setTargetLabel, repUnit} from '../src/features/gym/trainingPresentation';
import {displayWeight} from '../src/features/gym/trainingMath';
import {CachedDataNotice} from '../src/features/gym/CachedDataNotice';

const row=()=>({id:'workout',phase:'working',version:1,cursor:0,sets:[{id:'one'},{id:'two'}]});
function setup(send: (body:any)=>Promise<any>, read:()=>Promise<any>) {
  let pending:any=null;const accepted:any[]=[];
  const sync=new WorkoutSync(row(),send,read,{get:()=>pending,set:v=>{pending=v}},v=>accepted.push(v));
  return {sync,accepted,pending:()=>pending};
}
test('lost finish response is confirmed by reading without sending another reward operation',async()=>{
  let sends=0,reads=0;const final={...row(),phase:'finished',version:2};
  const q=setup(async()=>{sends++;throw Error('response lost')},async()=>{reads++;return final});
  await assert.rejects(q.sync.finish({reps:4}));assert.ok(q.pending());
  const result=await q.sync.finish({reps:99});
  assert.equal(result.phase,'finished');assert.equal(sends,1);assert.equal(reads,1);assert.equal(q.pending(),null);
});
test('uncommitted finish retries the same frozen operation and statistics',async()=>{
  const bodies:any[]=[];let fail=true;
  const q=setup(async b=>{bodies.push(structuredClone(b));if(fail)throw Error('offline');return {...row(),phase:'finished',version:2}},async()=>row());
  const values={reps:3,score:{count:3,total:270}};
  await assert.rejects(q.sync.finish(values));values.reps=99;values.score.total=0;fail=false;
  await q.sync.finish(values);
  assert.deepEqual(bodies[0],bodies[1]);assert.equal(bodies[1].reps,3);assert.equal(bodies[1].score.total,270);
});
test('two queued finish clicks send exactly one operation',async()=>{
  let sends=0;const q=setup(async()=>{sends++;return {...row(),phase:'finished',version:2}},async()=>row());
  const results=await Promise.all([q.sync.finish({reps:2}),q.sync.finish({reps:2})]);
  assert.equal(sends,1);assert.ok(results.every(r=>r.phase==='finished'));
});
test('recovery of a prior set completion never finishes the next set with the old counts',async()=>{
  let phase='complete';const bodies:any[]=[];
  const q=setup(async b=>{bodies.push(b);if(phase==='complete')throw Error('lost');return {...row(),cursor:1,version:2}},async()=>row());
  await assert.rejects(q.sync.run('complete',{reps:8}));phase='recover';
  await assert.rejects(q.sync.finish({reps:8}),/检查当前组/);
  assert.ok(bodies.every(b=>b.action==='complete'));assert.equal(q.sync.row.cursor,1);
});
test('cache cannot confirm a finish or erase an uncertain operation',async()=>{
  const q=setup(async()=>{throw Error('lost')},async()=>({...row(),phase:'finished',__offline:true}));
  await assert.rejects(q.sync.finish());const original=q.pending();
  await assert.rejects(q.sync.finish(),/缓存/);assert.deepEqual(q.pending(),original);assert.equal(q.accepted.length,0);
});
test('a conflict can confirm a finish committed by another page',async()=>{
  const q=setup(async()=>{throw {response:{status:409}}},async()=>({...row(),phase:'finished',version:5}));
  assert.equal((await q.sync.finish()).phase,'finished');assert.equal(q.pending(),null);
});
test('unconfirmed finish response is never treated as a saved result',async()=>{
  const q=setup(async()=>row(),async()=>row());await assert.rejects(q.sync.finish(),/尚未确认结束/);
});
const ready=(data:any)=>({loading:false,error:'',data});
test('today schedule failures and loading cannot masquerade as rest days or empty plans',()=>{
  const plans=ready({items:[{id:'plan'}]});
  assert.equal(todayPlanState(plans,{loading:true,error:'',data:null}),'loading');
  assert.equal(todayPlanState(plans,{loading:false,error:'timeout',data:null}),'error');
  assert.equal(todayPlanState(plans,ready({entries:[]})),'rest');
  assert.equal(todayPlanState(ready({items:[]}),ready({entries:[]})),'empty');
  assert.equal(todayPlanState({loading:false,error:'plans failed',data:null},ready({entries:[]})),'error');
  assert.equal(todayPlanState({loading:false,error:'plans failed',data:null},ready({entries:[{}]})),'scheduled');
});
test('timed, paired and repetition targets use distinct labels without rewriting stored kg',()=>{
  assert.equal(setTargetLabel({targetSeconds:90,exercise:{cameraType:'high_knees'}}),'90 秒');
  assert.equal(setTargetLabel({targetSeconds:0,targetReps:10,exercise:{cameraType:'high_knees'}}),'10 对');
  assert.equal(setTargetLabel({targetReps:8,exercise:{planCamera:{profile:'biceps_curl'}}}),'8 次');
  assert.equal(repUnit({cameraType:'high_knees'}),'对');
  const s={loadKg:10};assert.equal(displayWeight(s.loadKg,'lb'),22.046);assert.equal(s.loadKg,10);
});
test('cached query markup states its source, offers retry and does not imply server confirmation',()=>{
  const markup=renderToStaticMarkup(createElement(CachedDataNotice,{data:{__offline:true},label:'今日安排',reload:()=>{},busy:true}));
  assert.match(markup,/今日安排来自本机缓存/);assert.match(markup,/只读浏览/);assert.match(markup,/disabled/);
  assert.equal(renderToStaticMarkup(createElement(CachedDataNotice,{data:{}})),'');
});
test('favorites are locked per account and exercise, while unrelated items remain independent',async()=>{
  const q=new FavoriteRequests();let release!:()=>void,writes=0;
  const first=q.run('user1:one',async()=>{writes++;await new Promise<void>(r=>{release=r})});
  assert.equal(await q.run('user1:one',async()=>{writes++}),false);
  await q.run('user1:two',async()=>{writes++});await q.run('user2:one',async()=>{writes++});
  release();await first;assert.equal(writes,3);
  await assert.rejects(q.run('user1:one',async()=>{throw Error('failed')}));
  assert.equal(await q.run('user1:one',async()=>{writes++}),true);assert.equal(writes,4);
});
test('pagination deduplicates and retains confirmed favorite writes against an older page response',()=>{
  const old=[{id:'one',favorite:false},{id:'two',favorite:false}],incoming=[{id:'two',favorite:false},{id:'three',favorite:false}];
  const merged=mergeExercisePage(old,incoming,true,new Map([['two',true]]));
  assert.deepEqual(merged.map(e=>e.id),['one','two','three']);assert.equal(merged[1].favorite,true);
  assert.equal(old[1].favorite,false);assert.equal(incoming[0].favorite,false);
  assert.deepEqual(mergeExercisePage(old,incoming,false,new Map()).map(e=>e.id),['two','three']);
});
