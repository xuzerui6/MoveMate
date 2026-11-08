import {test,before} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import definitions from '../src/gym/new-recognition.json';
import libraryDefinitions from '../src/gym/library-recognition.json';
Object.assign(process.env,{SQLITE_PATH:path.join(mkdtempSync(path.join(tmpdir(),'new-recognition-')),'qa.db'),JWT_SECRET:'new-recognition-tests'.repeat(3),STUDENT_ID_SALT:'test-salt',ENV_FILE:'absent',NODE_ENV:'test',SMTP_USER:'',SMTP_PASS:''});
const {pool}=require('../src/db'),motion=require('../src/services/motion.service'),gym=require('../src/gym/service');
let uid:number,other:number;
before(async()=>{await pool.query('SELECT 1');for(const email of ['new-camera@qa.local','other-camera@qa.local']){const r=await pool.query('INSERT INTO users(email,nickname,password_hash,email_verified,campus_id,student_id) VALUES($1,$1,$2,1,1,$1) RETURNING id',[email,'unused']);if(!uid)uid=r.rows[0].id;else other=r.rows[0].id;}});
const zero={count:0,total:0,depth:0,stability:0,trunk:0,symmetry:0};
const score={count:1,total:85,depth:80,stability:90,trunk:80,symmetry:90};
const sideCounted=(type:string)=>['standing_leg_curl','one_arm_row','mountain_climber','split_squat'].includes(type);
for(const type of Object.keys(definitions))test(`${type}: new protocol, unscored reps, source lock, isolation and one XP settlement`,async()=>{
  // Standalone entries that are also library profiles (the tier 1-2 picker
  // entries) inherit the library protocol gate: exactly their profile
  // recognitionVersion (6). The original six standalone types accept v2.
  const v=(definitions as any)[type]?.recognitionVersion??2;
  await assert.rejects(motion.createSession(uid,{sportType:type,source:'camera'}),/刷新/);
  const s=await motion.createSession(uid,{id:randomUUID(),sportType:type,source:'camera'},v);
  await assert.rejects(motion.sessionAction(s.id,other,'progress',{reps:2},false,v));
  await assert.rejects(motion.sessionAction(s.id,uid,'progress',{reps:2}),/刷新/);
  await assert.rejects(motion.createSession(uid,{id:s.id,sportType:'squat',source:'camera'},v));
  const acc={...score,...(sideCounted(type)?{leftReps:1,rightReps:1}:{})};
  const p=await motion.sessionAction(s.id,uid,'progress',{reps:2,scoreAccumulator:acc},false,v);assert.equal(p.metrics.scoreAccumulator.count,1);
  await assert.rejects(motion.sessionAction(s.id,uid,'progress',{reps:2,scoreAccumulator:{...acc,count:3}},false,v));
  const paused=await motion.sessionAction(s.id,uid,'pause',{},false,v);assert.equal(paused.reps,2);assert.deepEqual(paused.metrics.scoreAccumulator,acc);
  const restored=await motion.activeSession(uid);assert.equal(restored.sportType,type);assert.equal(restored.reps,2);
  await motion.sessionAction(s.id,uid,'resume',{},false,v);
  const done=await motion.sessionAction(s.id,uid,'finish',{reps:2,scoreAccumulator:acc},false,v);assert.equal(done.xpEarned,4);assert.equal((await motion.sessionAction(s.id,uid,'finish',{},false,v)).xpEarned,4);
  assert.equal((await pool.query('SELECT COUNT(*) n FROM xp_ledger WHERE session_id=$1',[s.id])).rows[0].n,1);
  const demo=await motion.createSession(uid,{sportType:type,source:'demo'},v);assert.equal((await motion.sessionAction(demo.id,uid,'finish',{reps:3,scoreAccumulator:{...zero,...(sideCounted(type)?{leftReps:2,rightReps:1}:{})}},false,v)).xpEarned,0);
  const empty=await motion.createSession(uid,{sportType:type,source:'camera'},v);assert.equal((await motion.sessionAction(empty.id,uid,'finish',{},false,v)).xpEarned,0);
});
test('standing side counts are validated independently from score count and survive partial updates',async()=>{
  const s=await motion.createSession(uid,{sportType:'standing_leg_curl',source:'camera'},2);
  await assert.rejects(motion.sessionAction(s.id,uid,'progress',{reps:2,scoreAccumulator:{...zero,leftReps:1,rightReps:0}},false,2),/左右/);
  const acc={...zero,leftReps:1,rightReps:1};await motion.sessionAction(s.id,uid,'progress',{reps:2,scoreAccumulator:acc},false,2);
  const p=await motion.sessionAction(s.id,uid,'pause',{averageBpm:110},false,2);assert.deepEqual(p.metrics.scoreAccumulator,acc);
  await motion.sessionAction(s.id,uid,'finish',{},false,2);
  const state=await motion.trainingState(uid);assert.equal(state.totalSquats,0);assert.ok(state.totalXp>0);
  await assert.rejects(motion.createSession(uid,{sportType:'unknown_camera',source:'camera'},2));
});
test('explicit standalone-to-library mappings for every standalone definition, unchanged total IDs, no custom capability and plan time-only XP',async()=>{
  const all=await gym.library(uid,{camera:'1',limit:50});assert.equal(all.total,56);
  // The camera list exceeds one hard-capped 50-item page since tier 2;
  // fetch the definition IDs explicitly (ids route cap is 500).
  const byId=await gym.library(uid,{camera:'1',ids:Object.values(definitions).flatMap((d:any)=>d.exerciseIds).join(',')});
  for(const [type,definition]of Object.entries(definitions))for(const id of definition.exerciseIds){
    const exercise=byId.items.find((x:any)=>x.id===id);assert.equal(exercise.planCamera.profile,type);
    let w=await gym.startWorkout(uid,{id:randomUUID(),free:{exercises:[{exerciseId:id,sets:[{reps:3}]}]}});
    // Tier 1-2 definitions carry their library recognitionVersion (6); the
    // original standalone definitions start plan sets at v2.
    const act=(action:string,extra:any={},version:any=(definition as any).recognitionVersion??2)=>gym.actWorkout(uid,w.id,{operationId:randomUUID(),version:w.version,action,setId:w.sets[w.cursor]?.id,...extra},version);
    await assert.rejects(act('start',{inputMode:'camera'},null),/刷新/); // Explicit missing header below; default parameters are not a browser capability.
    w=await act('start',{inputMode:'camera'});
    const acc={...zero,...(type==='standing_leg_curl'?{leftReps:2,rightReps:0}:sideCounted(type)?{leftReps:1,rightReps:1}:{})};
    w=await act('progress',{reps:2,score:acc});w=await act('pause');assert.equal(w.sets[0].reps,2);w=await act('resume');
    const at=new Date(Date.now()-62000).toISOString();await pool.query('UPDATE sport_sessions SET active_since=$2 WHERE id=$1',[w.session.id,at]);await pool.query('UPDATE sport_intervals SET started_at=$2 WHERE session_id=$1 AND ended_at IS NULL',[w.session.id,at]);
    w=await act('complete',{reps:2,score:acc});w=await act('finish');assert.equal(w.session.xpEarned,1);assert.equal(w.session.metrics.planSquatReps,0);
  }
  const custom=await gym.saveExercise(uid,{nameZh:'哑铃前平举',bodyPart:'shoulders',equipment:'dumbbell',target:'delts',instructions:['手动记录'],planCamera:{profile:'front_raise'}});assert.equal((await gym.allExercises(uid)).find((x:any)=>x.id===custom.id).planCamera,undefined);
});

for(const [profile,definition]of Object.entries(libraryDefinitions))test(`${profile}: library-only ID allowlist, protocol v3, recovery and unique time settlement`,async()=>{
 for(const exerciseId of definition.exerciseIds){
  await assert.rejects(motion.createSession(uid,{sportType:profile,source:'camera'},3));
  const item=(await gym.allExercises(uid)).find((e:any)=>e.id===exerciseId);assert.equal(item.planCamera.profile,profile);
  let w=await gym.startWorkout(uid,{id:randomUUID(),free:{exercises:[{exerciseId,sets:[{reps:2}]}]}});
  const act=(action:string,extra:any={},protocol:any=("recognitionVersion" in definition?definition.recognitionVersion:3))=>gym.actWorkout(uid,w.id,{operationId:randomUUID(),version:w.version,action,setId:w.sets[w.cursor]?.id,...extra},protocol);
  await assert.rejects(act('start',{inputMode:'camera'},2),/刷新/);
  await assert.rejects(gym.actWorkout(other,w.id,{operationId:randomUUID(),version:w.version,action:'start',inputMode:'camera'},3));
  w=await act('start',{inputMode:'camera'});w=await act('progress',{reps:2,score});w=await act('pause');
  assert.equal((await gym.workout(uid,w.id)).sets[0].reps,2);assert.deepEqual(w.sets[0].score,score);w=await act('resume');
  const at=new Date(Date.now()-62000).toISOString();await pool.query('UPDATE sport_sessions SET active_since=$2 WHERE id=$1',[w.session.id,at]);await pool.query('UPDATE sport_intervals SET started_at=$2 WHERE session_id=$1 AND ended_at IS NULL',[w.session.id,at]);
  w=await act('complete',{reps:2,score});w=await act('finish');assert.equal(w.session.xpEarned,1);assert.equal(w.session.metrics.planSquatReps,0);assert.equal((await act('finish')).session.xpEarned,1);
  assert.equal((await pool.query('SELECT COUNT(*) n FROM xp_ledger WHERE session_id=$1',[w.session.id])).rows[0].n,1);
 }
});

test('all built-in template movements have recognition and shoulder press does not fall back to push-up',()=>{
 const {templates,exercises}=require('../src/gym/model');
 const all=templates();for(const t of all)for(const routine of t.routines)for(const entry of routine.exercises){const e=exercises.find((x:any)=>x.id===entry.exerciseId);assert.ok(e.cameraType||e.planCamera,`${t.key}: ${entry.exerciseId}`);}
 const upper=all.find((t:any)=>t.key==='upper_lower').routines.find((r:any)=>r.id==='upper');assert.ok(upper.exercises.some((e:any)=>e.exerciseId==='exdb:0405'));assert.ok(!upper.exercises.some((e:any)=>e.exerciseId==='motion:push_up'));
});

test('adaptive protocol is stored, cannot be downgraded by old pages, and unscored core repetitions settle once',async()=>{
 await assert.rejects(motion.createSession(uid,{sportType:'squat',source:'camera',recognitionStrategy:'adaptive-v1'},5),/刷新/);
 const data={id:randomUUID(),sportType:'squat',source:'camera',recognitionStrategy:'adaptive-v1'};const s=await motion.createSession(uid,data,6);assert.equal(s.metrics.recognitionStrategy,'adaptive-v1');assert.equal((await motion.createSession(uid,data,6)).id,s.id);
 await assert.rejects(motion.createSession(uid,{...data,recognitionStrategy:'legacy'},6),/策略/);
 await assert.rejects(motion.sessionAction(s.id,uid,'progress',{reps:2,scoreAccumulator:zero},false,5),/刷新/);
 await motion.sessionAction(s.id,uid,'progress',{reps:2,scoreAccumulator:zero,recognitionStrategy:'adaptive-v1'},false,6);
 await assert.rejects(motion.sessionAction(s.id,uid,'progress',{reps:2,recognitionStrategy:'legacy'},false,6),/策略/);
 const paused=await motion.sessionAction(s.id,uid,'pause',{},false,6);assert.equal(paused.metrics.recognitionStrategy,'adaptive-v1');assert.equal(paused.reps,2);
 await motion.sessionAction(s.id,uid,'resume',{},false,6);const done=await motion.sessionAction(s.id,uid,'finish',{},false,6);assert.equal(done.xpEarned,4);assert.equal((await motion.sessionAction(s.id,uid,'finish',{},false,6)).xpEarned,4);
});
test('adaptive plan strategy survives notes, refresh, pause and one timer settlement',async()=>{
 let w=await gym.startWorkout(uid,{id:randomUUID(),free:{exercises:[{exerciseId:'motion:squat',sets:[{reps:3}]}]}});
 const action=(name:string,extra:any={},protocol=6)=>gym.actWorkout(uid,w.id,{action:name,operationId:randomUUID(),version:w.version,setId:w.sets[w.cursor]?.id,...extra},protocol);
 await assert.rejects(action('start',{inputMode:'camera',recognitionStrategy:'adaptive-v1'},5),/刷新/);
 w=await action('start',{inputMode:'camera',recognitionStrategy:'adaptive-v1'});assert.equal(w.sets[0].recognitionStrategy,'adaptive-v1');
 await assert.rejects(action('progress',{reps:2,score:zero},5),/刷新/);
 w=await action('progress',{reps:2,score:zero,notes:'still local'});assert.equal(w.sets[0].recognitionStrategy,'adaptive-v1');w=await action('pause');assert.equal((await gym.workout(uid,w.id)).sets[0].recognitionStrategy,'adaptive-v1');assert.equal(w.sets[0].reps,2);
 w=await action('complete',{reps:2,score:zero});w=await action('finish');assert.equal(w.session.xpEarned,0);assert.equal((await action('finish')).session.xpEarned,0);
});

test('historical sessions without a strategy remain legacy and cannot switch during progress',async()=>{
 const s=await motion.createSession(uid,{sportType:'squat',source:'camera'},6);
 await pool.query('UPDATE sport_sessions SET metrics=$2 WHERE id=$1',[s.id,'{}']);
 await assert.rejects(motion.sessionAction(s.id,uid,'progress',{reps:0,recognitionStrategy:'adaptive-v1'},false,6),/策略/);
 const done=await motion.sessionAction(s.id,uid,'finish',{},false,6);assert.equal(done.reps,0);assert.equal(done.xpEarned,0);
});

test('step-3 axis assessments and per-rep evidence survive standalone sync and reject malformed states',async()=>{
 const s=await motion.createSession(uid,{id:randomUUID(),sportType:'hammer_curl',source:'camera'},2);
 const assessment={depth:{kind:'numeric'},stability:{kind:'numeric'},trunk:{kind:'numeric'},symmetry:{kind:'category',category:'slight'}};
 const acc={count:2,total:180,depth:185,stability:175,trunk:180,symmetry:0,symmetryOffsetsMs:[375,400]};
 const p=await motion.sessionAction(s.id,uid,'progress',{reps:2,scoreAccumulator:acc,axisAssessment:assessment},false,2);
 assert.deepEqual(p.metrics.axisAssessment,assessment);assert.deepEqual(p.metrics.scoreAccumulator.symmetryOffsetsMs,[375,400]);
 // A partial update without the fields keeps the stored state (no silent revert).
 const paused=await motion.sessionAction(s.id,uid,'pause',{averageBpm:100},false,2);
 assert.deepEqual(paused.metrics.axisAssessment,assessment);assert.deepEqual(paused.metrics.scoreAccumulator.symmetryOffsetsMs,[375,400]);
 await motion.sessionAction(s.id,uid,'resume',{},false,2);
 await assert.rejects(motion.sessionAction(s.id,uid,'progress',{reps:2,scoreAccumulator:acc,axisAssessment:{...assessment,symmetry:{kind:'category',category:'sideways'}}},false,2),/评分轴状态无效/);
 await assert.rejects(motion.sessionAction(s.id,uid,'progress',{reps:2,scoreAccumulator:acc,axisAssessment:{...assessment,symmetry:{kind:'unassessable',reason:' vibes '}}},false,2),/评分轴状态无效/);
 await assert.rejects(motion.sessionAction(s.id,uid,'progress',{reps:2,scoreAccumulator:{...acc,symmetryOffsetsMs:[1,2,3]}},false,2),/评分累计值无效/);
 await assert.rejects(motion.sessionAction(s.id,uid,'progress',{reps:2,scoreAccumulator:{...acc,symmetryOffsetsMs:[-5,400]}},false,2),/评分累计值无效/);
 await motion.sessionAction(s.id,uid,'finish',{},false,2);
});

test('axis-validity suspension (control) survives standalone + plan sync; XP stays rep-derived',async()=>{
 const s=await motion.createSession(uid,{id:randomUUID(),sportType:'hammer_curl',source:'camera'},2);
 const assessment={depth:{kind:'numeric'},stability:{kind:'unassessable',reason:'control'},trunk:{kind:'numeric'},symmetry:{kind:'category',category:'sync'}};
 const acc={count:2,total:150,depth:185,stability:60,trunk:180,symmetry:0,symmetryOffsetsMs:[90,110]};
 const p=await motion.sessionAction(s.id,uid,'progress',{reps:2,scoreAccumulator:acc,axisAssessment:assessment},false,2);
 assert.deepEqual(p.metrics.axisAssessment,assessment);assert.deepEqual(p.metrics.scoreAccumulator.symmetryOffsetsMs,[90,110]);
 // The withheld total changes presentation only: settlement still pays
 // reps × 2 XP for the camera session, exactly as for any scored set.
 const done=await motion.sessionAction(s.id,uid,'finish',{},false,2);assert.equal(done.xpEarned,4);
 const exerciseId=(definitions as any).hammer_curl.exerciseIds[0];
 let w=await gym.startWorkout(uid,{id:randomUUID(),free:{exercises:[{exerciseId,sets:[{reps:3}]}]}});
 const act=(action:string,extra:any={})=>gym.actWorkout(uid,w.id,{operationId:randomUUID(),version:w.version,action,setId:w.sets[w.cursor]?.id,...extra},2);
 w=await act('start',{inputMode:'camera'});
 const pacc={...acc,axisAssessment:assessment};
 w=await act('progress',{reps:2,score:pacc});
 assert.deepEqual(w.sets[0].score,pacc);
 await assert.rejects(act('progress',{reps:2,score:{...pacc,axisAssessment:{...assessment,stability:{kind:'unassessable',reason:'everything'}}}}),/axisAssessment|无效|不合法|参数/);
 w=await act('complete',{reps:2,score:pacc});w=await act('finish');assert.equal(w.phase,'finished');
});

test('step-3 front-raise band tallies and assessments survive plan-set sync and reject malformed states',async()=>{
 const exerciseId=(definitions as any).front_raise.exerciseIds[0];
 let w=await gym.startWorkout(uid,{id:randomUUID(),free:{exercises:[{exerciseId,sets:[{reps:3}]}]}});
 const act=(action:string,extra:any={})=>gym.actWorkout(uid,w.id,{operationId:randomUUID(),version:w.version,action,setId:w.sets[w.cursor]?.id,...extra},2);
 w=await act('start',{inputMode:'camera'});
 const assessment={depth:{kind:'bands',left:'shoulder',right:'below'},stability:{kind:'numeric'},trunk:{kind:'numeric'},symmetry:{kind:'unassessable',reason:'view'}};
 const acc={count:2,total:170,depth:0,stability:175,trunk:165,symmetry:0,depthBandCounts:{left:{shoulder:2},right:{below:1,shoulder:1}},axisAssessment:assessment};
 w=await act('progress',{reps:2,score:acc});
 assert.deepEqual(w.sets[0].score,acc);
 await assert.rejects(act('progress',{reps:2,score:{...acc,depthBandCounts:{left:{shoulder:'high'}}}}),/depthBandCounts|无效|不合法|参数/);
 await assert.rejects(act('progress',{reps:2,score:{...acc,axisAssessment:{...assessment,symmetry:{kind:'unassessable',reason:'diagonal'}}}}),/axisAssessment|无效|不合法|参数/);
 w=await act('pause');assert.deepEqual(w.sets[0].score,acc);
});
