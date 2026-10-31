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
for(const type of Object.keys(definitions))test(`${type}: new protocol, unscored reps, source lock, isolation and one XP settlement`,async()=>{
  await assert.rejects(motion.createSession(uid,{sportType:type,source:'camera'}),/刷新/);
  const s=await motion.createSession(uid,{id:randomUUID(),sportType:type,source:'camera'},2);
  await assert.rejects(motion.sessionAction(s.id,other,'progress',{reps:2},false,2));
  await assert.rejects(motion.sessionAction(s.id,uid,'progress',{reps:2}),/刷新/);
  await assert.rejects(motion.createSession(uid,{id:s.id,sportType:'squat',source:'camera'},2));
  const acc={...score,...(type==='standing_leg_curl'?{leftReps:1,rightReps:1}:{})};
  const p=await motion.sessionAction(s.id,uid,'progress',{reps:2,scoreAccumulator:acc},false,2);assert.equal(p.metrics.scoreAccumulator.count,1);
  await assert.rejects(motion.sessionAction(s.id,uid,'progress',{reps:2,scoreAccumulator:{...acc,count:3}},false,2));
  const paused=await motion.sessionAction(s.id,uid,'pause',{},false,2);assert.equal(paused.reps,2);assert.deepEqual(paused.metrics.scoreAccumulator,acc);
  const restored=await motion.activeSession(uid);assert.equal(restored.sportType,type);assert.equal(restored.reps,2);
  await motion.sessionAction(s.id,uid,'resume',{},false,2);
  const done=await motion.sessionAction(s.id,uid,'finish',{reps:2,scoreAccumulator:acc},false,2);assert.equal(done.xpEarned,4);assert.equal((await motion.sessionAction(s.id,uid,'finish',{},false,2)).xpEarned,4);
  assert.equal((await pool.query('SELECT COUNT(*) n FROM xp_ledger WHERE session_id=$1',[s.id])).rows[0].n,1);
  const demo=await motion.createSession(uid,{sportType:type,source:'demo'},2);assert.equal((await motion.sessionAction(demo.id,uid,'finish',{reps:3,scoreAccumulator:{...zero,...(type==='standing_leg_curl'?{leftReps:2,rightReps:1}:{})}},false,2)).xpEarned,0);
  const empty=await motion.createSession(uid,{sportType:type,source:'camera'},2);assert.equal((await motion.sessionAction(empty.id,uid,'finish',{},false,2)).xpEarned,0);
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
test('explicit nine library mappings, unchanged total IDs, no custom capability and plan time-only XP',async()=>{
  const all=await gym.library(uid,{camera:'1',limit:50});assert.equal(all.total,30);
  for(const [type,definition]of Object.entries(definitions))for(const id of definition.exerciseIds){
    const exercise=all.items.find((x:any)=>x.id===id);assert.equal(exercise.planCamera.profile,type);
    let w=await gym.startWorkout(uid,{id:randomUUID(),free:{exercises:[{exerciseId:id,sets:[{reps:3}]}]}});
    const act=(action:string,extra:any={},version:any=2)=>gym.actWorkout(uid,w.id,{operationId:randomUUID(),version:w.version,action,setId:w.sets[w.cursor]?.id,...extra},version);
    await assert.rejects(act('start',{inputMode:'camera'},null),/刷新/); // Explicit missing header below; default parameters are not a browser capability.
    w=await act('start',{inputMode:'camera'});
    const acc={...zero,...(type==='standing_leg_curl'?{leftReps:2,rightReps:0}:{})};
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
  const act=(action:string,extra:any={},protocol:any=3)=>gym.actWorkout(uid,w.id,{operationId:randomUUID(),version:w.version,action,setId:w.sets[w.cursor]?.id,...extra},protocol);
  await assert.rejects(act('start',{inputMode:'camera'},2),/刷新/);
  await assert.rejects(gym.actWorkout(other,w.id,{operationId:randomUUID(),version:w.version,action:'start',inputMode:'camera'},3));
  w=await act('start',{inputMode:'camera'});w=await act('progress',{reps:2,score});w=await act('pause');
  assert.equal((await gym.workout(uid,w.id)).sets[0].reps,2);assert.deepEqual(w.sets[0].score,score);w=await act('resume');
  const at=new Date(Date.now()-62000).toISOString();await pool.query('UPDATE sport_sessions SET active_since=$2 WHERE id=$1',[w.session.id,at]);await pool.query('UPDATE sport_intervals SET started_at=$2 WHERE session_id=$1 AND ended_at IS NULL',[w.session.id,at]);
  w=await act('complete',{reps:2,score});w=await act('finish');assert.equal(w.session.xpEarned,1);assert.equal(w.session.metrics.planSquatReps,0);assert.equal((await act('finish')).session.xpEarned,1);
  assert.equal((await pool.query('SELECT COUNT(*) n FROM xp_ledger WHERE session_id=$1',[w.session.id])).rows[0].n,1);
 }
});
