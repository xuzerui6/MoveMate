import {test,before} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
Object.assign(process.env,{SQLITE_PATH:path.join(mkdtempSync(path.join(tmpdir(),'plan-camera-')),'qa.db'),JWT_SECRET:'camera-tests'.repeat(5),STUDENT_ID_SALT:'camera-test-salt',ENV_FILE:'absent',NODE_ENV:'test',SMTP_USER:'',SMTP_PASS:''});
const {pool}=require('../src/db'),gym=require('../src/gym/service'),motion=require('../src/services/motion.service');
const {planCameraFor}=require('../src/gym/camera');
let uid:number,other:number;
before(async()=>{await pool.query('SELECT 1');for(const email of ['camera-owner@dajju.local','camera-other@dajju.local']){const r=await pool.query('INSERT INTO users(email,nickname,password_hash,email_verified,campus_id,student_id) VALUES($1,$1,$2,1,1,$1) RETURNING id',[email,'unused']);if(!uid)uid=r.rows[0].id;else other=r.rows[0].id;}});
const ids=['exdb:0294','exdb:0334','exdb:0405','exdb:0293','movemate:reverse_lunge','exdb:1373'];
const action=(w:any,kind:string,extra:any={})=>gym.actWorkout(uid,w.id,{operationId:randomUUID(),version:w.version,setId:w.sets[w.cursor]?.id,action:kind,...extra});
const begin=(exerciseId:string,sets:any[]=[{reps:3}])=>gym.startWorkout(uid,{id:randomUUID(),free:{exercises:[{exerciseId,sets}]}});
test('camera filter exposes explicit standard IDs, never variants or user-supplied capability',async()=>{
 const all=await gym.library(uid,{camera:'1',limit:50});assert.equal(all.total,30);assert.ok(all.items.every((e:any)=>e.cameraType||e.planCamera));
 for(const id of ids)assert.equal(all.items.find((e:any)=>e.id===id).planCamera.profile,planCameraFor(id).profile);
 for(const id of ['exdb:0285','exdb:0361','exdb:3470','exdb:1386'])assert.equal(planCameraFor(id),undefined);
 const custom=await gym.saveExercise(uid,{nameZh:'伪造摄像头动作',bodyPart:'chest',equipment:'body weight',target:'chest',instructions:['仅手动'],planCamera:{profile:'biceps_curl'},cameraType:'squat'});assert.equal((await gym.allExercises(uid)).find((e:any)=>e.id===custom.id).planCamera,undefined);
 let w=await begin(custom.id);await assert.rejects(action(w,'start',{inputMode:'camera'}));w=await action(w,'start',{inputMode:'manual'});await action(w,'finish');
});
for(const id of ids)test(`${id}: camera progress/pause/resume/finish persist, idempotent and time-only XP`,async()=>{
 const p=await gym.savePlan(uid,{name:id,routines:[{id:'a',name:'A',exercises:[{exerciseId:id,sets:[{reps:3}]}]}]});let w=await gym.startWorkout(uid,{id:randomUUID(),planId:p.id,routineId:'a'});assert.ok(w.sets[0].exercise.planCamera);
 await assert.rejects(gym.actWorkout(other,w.id,{operationId:randomUUID(),version:w.version,action:'start',inputMode:'camera'}));
 w=await action(w,'start',{inputMode:'camera'});
 const isLunge=id==='movemate:reverse_lunge',score={count:1,total:85,depth:80,stability:90,trunk:80,symmetry:90,...(isLunge?{leftReps:1,rightReps:1}:{})};
 w=await action(w,'progress',{reps:2,score});w=await action(w,'pause');assert.deepEqual((await gym.workout(uid,w.id)).sets[0].score,score);
 w=await action(w,'resume');await assert.rejects(action(w,'progress',{reps:2,score:{...score,count:3}}));w=await gym.workout(uid,w.id);
 const at=new Date(Date.now()-62000).toISOString();await pool.query('UPDATE sport_sessions SET active_since=$2 WHERE id=$1',[w.session.id,at]);await pool.query('UPDATE sport_intervals SET started_at=$2 WHERE session_id=$1 AND ended_at IS NULL',[w.session.id,at]);
 w=await action(w,'complete',{reps:2,score});const op={operationId:randomUUID(),version:w.version,action:'finish'};w=await gym.actWorkout(uid,w.id,op);assert.equal(w.session.xpEarned,1);assert.equal(w.session.metrics.planSquatReps,0);assert.equal(w.session.metrics.formScore,85);assert.equal((await gym.actWorkout(uid,w.id,op)).session.xpEarned,1);assert.deepEqual(w.sets[0].score,score);
 await assert.rejects(motion.createSession(uid,{id:randomUUID(),source:'camera',sportType:planCameraFor(id).profile}));
});
test('timed and single-side sets reject camera; manual conversion clears scores without losing reps',async()=>{
 for(const set of [{seconds:30},{side:'left'}]){let w=await begin(ids[0],[set]);await assert.rejects(action(w,'start',{inputMode:'camera'}));w=await action(w,'start',{inputMode:'manual'});await action(w,'finish');}
 let w=await begin(ids[0]);w=await action(w,'start',{inputMode:'camera'});w=await action(w,'progress',{reps:2,score:{count:0,total:0,depth:0,stability:0,trunk:0,symmetry:0}});w=await action(w,'pause');w=await action(w,'manual',{reps:2});assert.equal(w.sets[0].reps,2);assert.equal(w.sets[0].inputMode,'mixed');assert.deepEqual(w.sets[0].score,{});w=await action(w,'finish');assert.equal(w.session.xpEarned,0);
});
test('running snapshot does not gain newly available recognition implicitly',async()=>{
 let w=await begin(ids[0]);const row=(await pool.query('SELECT data FROM gym_sets WHERE id=$1',[w.sets[0].id])).rows[0],data=JSON.parse(row.data);delete data.exercise.planCamera;await pool.query('UPDATE gym_sets SET data=$2 WHERE id=$1',[w.sets[0].id,JSON.stringify(data)]);w=await gym.workout(uid,w.id);await assert.rejects(action(w,'start',{inputMode:'camera'}));w=await action(w,'start',{inputMode:'manual'});await action(w,'finish');
});
