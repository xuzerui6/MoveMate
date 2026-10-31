import { test } from 'node:test';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { fixture, password } from './fixture.mjs';
import bcrypt from '../../server/node_modules/bcryptjs/index.js';
import { voicePoolTests } from './voice-pool.mjs';
const migrationSecret = 'm'.repeat(64);
const mf = new Miniflare(convertV4MiniflareOptions({ workers:[{name:'app',outboundService:'voice-provider', modules: true, scriptPath:'dist/test-worker.js', compatibilityDate:'2026-10-14', compatibilityFlags:['nodejs_compat'], durableObjects:{BACKEND:{className:'TestBackend',useSQLite:true},PROBE:{className:'RuntimeProbe',useSQLite:true}}, bindings:{INSTANCE:'test',JWT_SECRET:'j'.repeat(64),STUDENT_ID_SALT:'s'.repeat(64),XIAOZHI_COOKIE_SECRET:'x'.repeat(64),XIAOZHI_POOL_SECRET:'p'.repeat(64),MIGRATION_SECRET:migrationSecret,NODE_ENV:'production',CLOUDFLARE:'1',XIAOZHI_IDENTITY_MODE:'personal'}, serviceBindings:{ASSETS:request=>new URL(request.url).pathname==='/assets/missing.js'?new Response('<html>SPA</html>',{headers:{'Content-Type':'text/html'}}):new Response('asset')} },{name:'voice-provider',modules:true,compatibilityDate:'2026-10-14',script:`
export default {async fetch(request){
 if(new URL(request.url).hostname==='api.tenclass.net')return Response.json({websocket:{url:'wss://voice.invalid/socket',token:'synthetic-test-token'}});
 if(request.headers.get('upgrade')!=='websocket')return new Response('missing upgrade',{status:400});
 const [client,server]=Object.values(new WebSocketPair());server.binaryType='arraybuffer';server.accept();server.addEventListener('close',()=>{try{server.close()}catch{}});
 server.addEventListener('message',event=>{if(typeof event.data==='string'){const m=JSON.parse(event.data);if(m.type==='hello')server.send(JSON.stringify({type:'hello',session_id:crypto.randomUUID(),audio_params:{sample_rate:24000}}));else server.send(event.data);}else server.send(event.data)});
 return new Response(null,{status:101,webSocket:client});
}};`}] }));
const call = async (path, {method='GET',body,token,migration=false,headers={}}={}) => {
 const response=await mf.dispatchFetch('http://localhost'+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{}),...(migration?{Authorization:'Bearer '+migrationSecret}:{}),...headers},body:body?JSON.stringify(body):undefined});
 let data; const text=await response.text(); try{data=JSON.parse(text)}catch{data=text};return {status:response.status,data,headers:response.headers};
};
const migrate=(action,body)=>call('/api/migration/'+action,{method:body?'POST':'GET',body,migration:true});
let tokens=[],gameId,adminToken;
const sockets=[];
const socket = async token => {
 const response=await mf.dispatchFetch('http://localhost/api/realtime/socket',{headers:{Upgrade:'websocket',Origin:'http://localhost'}});
 assert.equal(response.status,101); const ws=response.webSocket;ws.accept();sockets.push(ws);
 const messages=[];ws.addEventListener('message',e=>{try{messages.push(JSON.parse(e.data))}catch{messages.push(e.data)}});
 const wait=async predicate=>{for(let i=0;i<100;i++){const n=messages.findIndex(predicate);if(n>=0)return messages.splice(n,1)[0];await new Promise(r=>setTimeout(r,10))}throw new Error('WebSocket message timeout: '+JSON.stringify(messages))};
 ws.send(JSON.stringify({event:'auth',data:{token}}));await wait(m=>m.event==='authenticated');
 return {ws,messages,wait,send:(event,data,requestId)=>ws.send(JSON.stringify({event,data,requestId}))};
};
await test('Workers runtime migration and business regression', async t=>{
 try {
 await t.test('missing static chunks never cache an HTML fallback as immutable JavaScript',async()=>{
 const missing=await mf.dispatchFetch('http://localhost/assets/missing.js');assert.equal(missing.status,404);assert.equal(missing.headers.get('Cache-Control'),'no-store');
 const asset=await mf.dispatchFetch('http://localhost/assets/valid.js');assert.equal(asset.status,200);assert.match(asset.headers.get('Cache-Control'),/immutable/);
 });
 await t.test('unimported instance stays closed and migration endpoint requires a secret',async()=>{
 assert.equal((await call('/health')).status,503);assert.equal((await call('/api/migration/status')).status,401);
 });
 const {manifest,parts}=fixture({largeAvatar:true});
 await t.test('snapshot import resumes, validates checkpoints and preserves hashes',async()=>{
 assert.equal((await migrate('begin',manifest)).status,200);
 const first=parts[0];assert.equal((await migrate('part',first)).status,200);assert.equal((await migrate('part',first)).status,200);
 assert.equal((await migrate('part',{...first,hash:'wrong'})).status,409);
 for(const part of parts.slice(1))assert.equal((await migrate('part',part)).status,200);
 const verified=await migrate('verify',{});assert.equal(verified.status,200,JSON.stringify(verified.data));
 assert.equal((await migrate('open',{})).status,200);assert.equal((await call('/health')).status,200);
 assert.equal((await migrate('part',first)).status,409);
 });
 await t.test('existing bcrypt password logs in and tokens retain verified permissions',async()=>{
 for(const email of ['host@dajju.local','player1@dajju.local','player2@dajju.local']){const r=await call('/api/v1/auth/login',{method:'POST',body:{email,password}});assert.equal(r.status,200,JSON.stringify(r.data));tokens.push(r.data.data.token)}
 assert.equal((await call('/api/v1/auth/register',{method:'POST',body:{email:'test@mails.jlu.edu.cn',password:'password',nickname:'test',campus_id:1}})).status,400);
 });
 await t.test('native transactions rollback, isolate readers and unlock after errors',async()=>{
 const namespace=await mf.getDurableObjectNamespace('PROBE');const actor=namespace.get(namespace.idFromName('probe'));
 const failed=actor.fetch('http://test/write?id=1&fail=1');const reader=actor.fetch('http://test/read');
 assert.equal((await failed).status,409);assert.deepEqual(await (await reader).json(),[]);
 const writes=await Promise.all([actor.fetch('http://test/write?id=2'),actor.fetch('http://test/write?id=3')]);
 assert(writes.every(r=>r.status===200));assert.deepEqual(await (await actor.fetch('http://test/read')).json(),[{id:2,value:11},{id:3,value:11}]);
 const other=namespace.get(namespace.idFromName('isolated'));assert.deepEqual(await(await other.fetch('http://test/read')).json(),[]);
 });
 await t.test('concurrent last-slot joins leave exactly one active member',async()=>{
 const created=await call('/api/v1/games',{method:'POST',token:tokens[0],body:{sport_type:'basketball',title:'Worker regression',campus_id:1,venue_id:10,max_players:2,start_time:new Date(Date.now()+65*60000).toISOString()}});
 assert.equal(created.status,200,JSON.stringify(created.data));gameId=created.data.data.game.id;
 const results=await Promise.all(tokens.slice(1).map(token=>call(`/api/v1/games/${gameId}/join`,{method:'POST',token,body:{}})));
 assert.equal(results.filter(r=>r.status===200).length,1,JSON.stringify(results));
 const game=await call(`/api/v1/games/${gameId}`,{token:tokens[0]});assert.equal(game.data.data.members.length,2);assert.equal(game.data.data.game.member_count,2);
 });
 await t.test('native sockets authenticate, exchange messages and revoke departed members',async()=>{
 const detail=(await call(`/api/v1/games/${gameId}`,{token:tokens[0]})).data.data;
 const memberId=detail.members.find(m=>m.user_id!==1).user_id;const memberToken=tokens[memberId-1];
 const host=await socket(tokens[0]),member=await socket(memberToken),outsider=await socket(tokens[[2,3].find(id=>id!==memberId)-1]);
 for(const s of [host,member]){s.send('join_room',{gameId});await s.wait(m=>m.event==='chat_mode')}
 outsider.send('join_room',{gameId});await outsider.wait(m=>m.event==='error');
 member.send('send_message',{gameId,content:'native websocket message'},'request-1');
 assert.equal((await member.wait(m=>m.event==='ack')).requestId,'request-1');
 assert.equal((await host.wait(m=>m.event==='new_message')).data.content,'native websocket message');
 assert.equal((await member.wait(m=>m.event==='new_message')).data.content,'native websocket message');
 assert.equal((await call(`/api/v1/games/${gameId}/messages`,{token:memberToken})).status,200);
 assert.equal((await call(`/api/v1/games/${gameId}/leave`,{method:'POST',token:memberToken,body:{}})).status,200);
 host.send('send_message',{gameId,content:'after leave'},'request-2');await host.wait(m=>m.event==='ack');
 await new Promise(r=>setTimeout(r,60));assert(!member.messages.some(m=>m.event==='new_message'&&m.data.content==='after leave'));
 member.send('send_message',{gameId,content:'blocked'},'request-3');assert((await member.wait(m=>m.event==='ack')).data.error);
 });
 await t.test('four camera actions settle once, demos stay zero and accounts are isolated',async()=>{
 for(const sportType of ['squat','jumping_jack','high_knees','push_up'])for(const source of ['camera','demo']){
 const r=await call('/api/v1/sport-sessions',{method:'POST',token:tokens[0],body:{sportType,source}});assert.equal(r.status,200,JSON.stringify(r.data));const id=r.data.data.id;
 const finished=await call(`/api/v1/sport-sessions/${id}/finish`,{method:'POST',token:tokens[0],body:{reps:3}});assert.equal(finished.status,200,JSON.stringify(finished.data));assert.equal(finished.data.data.xpEarned,source==='camera'?6:0);
 const retry=await call(`/api/v1/sport-sessions/${id}/finish`,{method:'POST',token:tokens[0],body:{reps:99}});assert.equal(retry.data.data.xpEarned,finished.data.data.xpEarned);
 assert.equal((await call(`/api/v1/sport-sessions/${id}/finish`,{method:'POST',token:tokens[1],body:{}})).status,404);
 }
 assert.equal((await call('/api/v1/sport-sessions',{method:'POST',token:tokens[0],body:{sportType:'invalid',source:'camera'}})).status,400);
 });
 await t.test('six extended actions require protocol v2, preserve unscored side counts and settle once',async()=>{
 const headers={'X-MoveMate-Recognition-Version':'2'};
 for(const sportType of ['hammer_curl','front_raise','triceps_kickback','romanian_deadlift','glute_bridge','standing_leg_curl'])for(const source of ['camera','demo']){
 assert.equal((await call('/api/v1/sport-sessions',{method:'POST',token:tokens[2],body:{sportType,source}})).status,409);
 const created=await call('/api/v1/sport-sessions',{method:'POST',token:tokens[2],headers,body:{sportType,source}});
 assert.equal(created.status,200,JSON.stringify(created.data));const id=created.data.data.id;
 const scoreAccumulator={count:0,total:0,depth:0,stability:0,trunk:0,symmetry:0,...(sportType==='standing_leg_curl'?{leftReps:2,rightReps:1}:{})};
 const body={reps:3,scoreAccumulator};
 assert.equal((await call(`/api/v1/sport-sessions/${id}/pause`,{method:'POST',token:tokens[2],body})).status,409);
 const paused=await call(`/api/v1/sport-sessions/${id}/pause`,{method:'POST',token:tokens[2],headers,body});
 assert.equal(paused.status,200,JSON.stringify(paused.data));
 if(sportType==='standing_leg_curl')assert.equal(paused.data.data.metrics.scoreAccumulator.leftReps,2);
 const finished=await call(`/api/v1/sport-sessions/${id}/finish`,{method:'POST',token:tokens[2],headers,body});
 assert.equal(finished.status,200,JSON.stringify(finished.data));assert.equal(finished.data.data.xpEarned,source==='camera'?6:0);
 const retry=await call(`/api/v1/sport-sessions/${id}/finish`,{method:'POST',token:tokens[2],headers,body});assert.equal(retry.data.data.xpEarned,finished.data.data.xpEarned);
 }
 });
 await t.test('alarm retries preserve transitions, attendance and exactly-once group XP',async()=>{
 const namespace=await mf.getDurableObjectNamespace('BACKEND');const actor=namespace.get(namespace.idFromName('test'));
 const created=await call('/api/v1/games',{method:'POST',token:tokens[0],body:{sport_type:'basketball',title:'Alarm lifecycle',campus_id:1,venue_id:10,max_players:3,start_time:new Date(Date.now()+9*60000).toISOString()}});
 assert.equal(created.status,200);const id=created.data.data.game.id;
 assert.equal((await call(`/api/v1/games/${id}/join`,{method:'POST',token:tokens[1],body:{}})).status,200);
 await actor.forceAlarm();await actor.forceAlarm();
 const ready=(await call(`/api/v1/games/${id}`,{token:tokens[0]})).data.data;assert.equal(ready.game.status,'ready');
 for(const token of tokens.slice(0,2))assert.equal((await call(`/api/v1/games/${id}/check-in`,{method:'POST',token,body:{}})).status,200);
 assert.equal((await call(`/api/v1/games/${id}/attendance/confirm`,{method:'POST',token:tokens[0],body:{user_id:2}})).status,200);
 assert.equal((await call(`/api/v1/games/${id}/start`,{method:'POST',token:tokens[0],body:{}})).status,200);
 const sessions=[];for(const token of tokens.slice(0,2)){const r=await call('/api/v1/sport-sessions',{method:'POST',token,body:{sportType:'basketball',source:'timer',gameId:id}});assert.equal(r.status,200);sessions.push(r.data.data.id)}
 await actor.ageSession(sessions[0],35);await actor.ageSession(sessions[1],70);
 assert.equal((await call(`/api/v1/sport-sessions/${sessions[0]}/pause`,{method:'POST',token:tokens[0],body:{}})).status,200);
 const races=await Promise.all([call(`/api/v1/games/${id}/complete`,{method:'POST',token:tokens[0],body:{}}),call(`/api/v1/sport-sessions/${sessions[1]}/finish`,{method:'POST',token:tokens[1],body:{}})]);
 assert.equal(races[0].status,200);await actor.forceAlarm();await actor.forceAlarm();
 for(const [index,token]of tokens.slice(0,2).entries()){const state=(await call('/api/v1/training/state',{token})).data.data;const row=state.sessions.find(s=>s.id===sessions[index]);assert(row.settled);assert.equal(row.xpEarned,index?2:1);const again=await call(`/api/v1/sport-sessions/${row.id}/finish`,{method:'POST',token,body:{}});assert.equal(again.data.data.xpEarned,row.xpEarned)}
 assert.equal((await call(`/api/v1/games/${id}/complete`,{method:'POST',token:tokens[0],body:{}})).status,409);
 assert.equal(await actor.pendingEvents(),0);
 await actor.brokenOutbox();
 await assert.rejects(actor.forceAlarm());
 assert.equal(await actor.pendingEvents(),1);
 await actor.brokenOutbox(true);await actor.forceAlarm();
 assert.equal(await actor.pendingEvents(),0);
 });
 await t.test('native voice bridge preserves hello and binary audio beyond handshake timeout',async()=>{
 const initialized=await call('/api/xiaozhi/device',{method:'POST',token:tokens[2],body:{}});
 assert.equal(initialized.status,200);assert.equal(initialized.data.status,'ready');
 const cookie=initialized.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
 const r=await mf.dispatchFetch('http://localhost/api/xiaozhi/socket',{headers:{Upgrade:'websocket',Origin:'http://localhost',Cookie:cookie}});
 assert.equal(r.status,101);const ws=r.webSocket;ws.binaryType='arraybuffer';ws.accept();sockets.push(ws);
 const messages=[];ws.addEventListener('message',e=>messages.push(e.data));
 const wait=async pred=>{for(let i=0;i<200;i++){const n=messages.findIndex(pred);if(n>=0)return messages.splice(n,1)[0];await new Promise(r=>setTimeout(r,10))}throw new Error('voice message timeout')};
 await wait(m=>typeof m==='string'&&JSON.parse(m).bridge==='ready');
 ws.send(JSON.stringify({type:'hello',version:1,transport:'websocket',audio_params:{format:'opus',sample_rate:16000,channels:1,frame_duration:60}}));
 await wait(m=>typeof m==='string'&&JSON.parse(m).type==='hello');
 const bytes=new Uint8Array([1,7,9,255]);ws.send(bytes.buffer);assert.deepEqual(new Uint8Array(await wait(m=>m instanceof ArrayBuffer)),bytes);
 await new Promise(r=>setTimeout(r,10500));
 ws.send(JSON.stringify({type:'test-keepalive'}));await wait(m=>typeof m==='string'&&JSON.parse(m).type==='test-keepalive');
 ws.close();
 });
 await t.test('large avatars use chunks and round-trip exact bytes',async()=>{
 const bytes=Buffer.alloc(3*1024*1024+193,0x31);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);
 const boundary='----testAvatarBoundary';const form=Buffer.concat([Buffer.from('--'+boundary+'\r\nContent-Disposition: form-data; name="file"; filename="large.png"\r\nContent-Type: image/png\r\n\r\n'),bytes,Buffer.from('\r\n--'+boundary+'--\r\n')]);
 const r=await mf.dispatchFetch('http://localhost/api/v1/users/avatar',{method:'POST',headers:{Authorization:'Bearer '+tokens[0],'Content-Type':'multipart/form-data; boundary='+boundary},body:form});assert.equal(r.status,200,await r.clone().text());const url=(await r.json()).data.url;
 const image=await mf.dispatchFetch('http://localhost'+url);assert.equal(image.status,200);assert.deepEqual(Buffer.from(await image.arrayBuffer()),bytes);
 });
 await t.test('profiles and real XP remain scoped to their account',async()=>{
 const before=await call('/api/v1/training/state',{token:tokens[0]});assert.equal(before.data.data.totalXp,25);
 const other=await call('/api/v1/training/state',{token:tokens[1]});assert.equal(other.data.data.totalXp,2);
 assert.equal((await call('/api/v1/training/avatar',{method:'PATCH',token:tokens[0],body:{activeOutfit:'running'}})).status,403);
 assert.equal((await call('/api/v1/users/me',{method:'PUT',token:tokens[0],body:{nickname:'Worker saved',sport_preferences:'["running"]'}})).status,200);
 });
 await t.test('operator provisioning supports admin login without granting ordinary users access',async()=>{
 const passwordHash=await bcrypt.hash('op5!!',10);
 // An early rejected POST body can reset Miniflare's reused HTTP socket.
 assert.equal((await call('/api/migration/provision-admin',{method:'POST',token:tokens[0],body:{passwordHash},headers:{Connection:'close'}})).status,401);
 const first=await migrate('provision-admin',{passwordHash});assert.equal(first.status,200);assert.equal(first.data.created,true);
 const again=await migrate('provision-admin',{passwordHash:await bcrypt.hash('other-password',10)});assert.equal(again.status,200);assert.equal(again.data.created,false);assert.equal(again.data.id,first.data.id);
 assert.equal((await call('/api/v1/auth/login',{method:'POST',body:{email:'admin',password:'wrong'}})).status,404);
 const login=await call('/api/v1/auth/login',{method:'POST',body:{email:'admin',password:'op5!!'}});assert.equal(login.status,200,JSON.stringify(login.data));assert.equal(login.data.data.user.is_admin,true);adminToken=login.data.data.token;
 for(const panel of ['stats','users','games','venues','feedback']){
 assert.equal((await call('/api/v1/admin/'+panel,{token:login.data.data.token})).status,200,panel);
 assert.equal((await call('/api/v1/admin/'+panel,{token:tokens[0]})).status,403,panel);
 }
 });
 await t.test('native plan operations persist, isolate accounts and settle once by valid time',async()=>{
 const token=tokens[0],p=(await call('/api/v1/training-plans',{method:'POST',token,body:{name:'Worker plan',routines:[{id:'a',name:'A',exercises:[{exerciseId:'motion:high_knees',sets:[{reps:2,restSec:60}]}]}]}})).data.data;
 const created=await call('/api/v1/workout-sessions',{method:'POST',token,body:{id:crypto.randomUUID(),planId:p.id,routineId:'a'}});assert.equal(created.status,200,JSON.stringify(created.data));let w=created.data.data;assert.equal(w.session.status,'paused');
 const action=async(a,extra={})=>{const r=await call(`/api/v1/workout-sessions/${w.id}/actions`,{method:'POST',token,body:{operationId:crypto.randomUUID(),version:w.version,action:a,...extra}});assert.equal(r.status,200,JSON.stringify(r.data));return r.data.data};
 assert.equal((await call('/api/v1/workout-sessions/'+w.id,{token:tokens[1]})).status,404);
 w=await action('start',{inputMode:'camera'});const ns=await mf.getDurableObjectNamespace('BACKEND');await ns.get(ns.idFromName('test')).ageSession(w.session.id,61);
 const bad=await call(`/api/v1/workout-sessions/${w.id}/actions`,{method:'POST',token,body:{operationId:'bad',version:w.version,action:'complete',reps:2,score:{count:1,total:999,depth:90,stability:90,trunk:90,symmetry:90}}});assert.equal(bad.status,400);
 w=await action('complete',{reps:2,score:{count:2,total:190,depth:190,stability:190,trunk:190,symmetry:190}});assert.equal(w.phase,'resting');
 const finish={operationId:'finish-once',version:w.version,action:'finish'};const first=await call(`/api/v1/workout-sessions/${w.id}/actions`,{method:'POST',token,body:finish});assert.equal(first.status,200,JSON.stringify(first.data));assert.equal(first.data.data.session.xpEarned,1);
 const again=await call(`/api/v1/workout-sessions/${w.id}/actions`,{method:'POST',token,body:finish});assert.equal(again.data.data.session.xpEarned,1);
 const state=await call('/api/v1/training/state',{token});assert.equal(state.data.data.totalXp,26);assert.equal(state.data.data.history.find(s=>s.id===w.session.id).workoutId,w.id);
 const backup=await migrate('gym-backup');assert.equal(backup.status,200);assert.ok(JSON.parse(backup.data.backup).bookmark);
 });
 await t.test('native imports stay idempotent, body data private and no credentials leak in export',async()=>{
 const token=tokens[0],body={format:'strong',text:'Date,Workout Name,Exercise Name,Weight,Reps,Seconds\n2026-10-01,Worker import,徒手深蹲,5,10,30'};
 assert.equal((await call('/api/v1/training-imports/preview',{method:'POST',token,body})).data.data.missing.length,0);
 assert.equal((await call('/api/v1/training-imports/commit',{method:'POST',token,body})).data.data.imported,1);
 assert.equal((await call('/api/v1/training-imports/commit',{method:'POST',token,body})).data.data.duplicates,1);
 await call('/api/v1/body-measurements',{method:'PUT',token,body:{date:'2026-10-17',weightKg:70}});
 assert.equal((await call('/api/v1/body-measurements',{token:tokens[1]})).data.data.items.length,0);
 const exported=(await call('/api/v1/training-export',{token})).data.data;assert.equal(exported.workouts.filter(w=>w.imported).length,1);assert.ok(!JSON.stringify(exported).includes('password_hash'));
 });
 await t.test('six plan-only camera families persist scores and side counts without extending standalone reward types',async()=>{
  const token=tokens[0];const catalog=await call('/api/v1/exercises?camera=1&limit=50',{token});assert.equal(catalog.data.data.total,37);
  for(const id of ['exdb:0294','exdb:0334','exdb:0405','exdb:0293','movemate:reverse_lunge','exdb:1373']){
   let r=await call('/api/v1/workout-sessions',{method:'POST',token,body:{id:crypto.randomUUID(),free:{exercises:[{exerciseId:id,sets:[{reps:2}]}]}}});assert.equal(r.status,200,JSON.stringify(r.data));let w=r.data.data;
   const act=async(action,extra={})=>{r=await call('/api/v1/workout-sessions/'+w.id+'/actions',{method:'POST',token,body:{operationId:crypto.randomUUID(),version:w.version,setId:w.sets[w.cursor]?.id,action,...extra}});assert.equal(r.status,200,JSON.stringify(r.data));w=r.data.data;};
   await act('start',{inputMode:'camera'});const score={count:1,total:90,depth:90,stability:90,trunk:90,symmetry:90,...(id==='movemate:reverse_lunge'?{leftReps:1,rightReps:1}:{})};await act('progress',{reps:2,score});await act('pause');r=await call('/api/v1/workout-sessions/'+w.id,{token});assert.deepEqual(r.data.data.sets[0].score,score);await act('complete',{reps:2,score});await act('finish');assert.equal(w.session.xpEarned,0);assert.equal(w.session.metrics.formScore,90);assert.equal(w.session.metrics.planSquatReps,0);
  }
 });
 await t.test('common library camera profiles require v3 and keep one timer-only workout',async()=>{
  const token=tokens[2],headers={'X-MoveMate-Recognition-Version':'3'};
  for(const exerciseId of ['exdb:1760','exdb:0043','exdb:0031','exdb:0025','exdb:0378','exdb:2188']){
   let r=await call('/api/v1/workout-sessions',{method:'POST',token,body:{id:crypto.randomUUID(),free:{exercises:[{exerciseId,sets:[{reps:2}]}]}}});assert.equal(r.status,200,JSON.stringify(r.data));let w=r.data.data;
   const act=async(action,values={})=>{const result=await call('/api/v1/workout-sessions/'+w.id+'/actions',{method:'POST',token,headers,body:{action,operationId:crypto.randomUUID(),version:w.version,setId:w.sets[w.cursor]?.id,...values}});assert.equal(result.status,200,JSON.stringify(result.data));w=result.data.data;};
   assert.equal((await call('/api/v1/workout-sessions/'+w.id+'/actions',{method:'POST',token,headers:{'X-MoveMate-Recognition-Version':'2'},body:{action:'start',inputMode:'camera',operationId:crypto.randomUUID(),version:w.version}})).status,409);
   await act('start',{inputMode:'camera'});await act('progress',{reps:2,score:{count:0,total:0,depth:0,stability:0,trunk:0,symmetry:0}});await act('pause');assert.equal(w.sets[0].reps,2);await act('complete');await act('finish');assert.equal(w.session.xpEarned,0);assert.equal(w.session.metrics.planSquatReps,0);await act('finish');assert.equal(w.session.xpEarned,0);
  }
 });
 await t.test('v4 template movements reject old writers and preserve timer-only settlement',async()=>{
 const token=tokens[2],headers={'X-MoveMate-Recognition-Version':'4'};
 for(const exerciseId of ['exdb:0032','exdb:0027','exdb:0042','exdb:0314']){
 let r=await call('/api/v1/workout-sessions',{method:'POST',token,body:{id:crypto.randomUUID(),free:{exercises:[{exerciseId,sets:[{reps:2}]}]}}});assert.equal(r.status,200);let w=r.data.data;
 const send=async(action,extra={})=>{const r=await call('/api/v1/workout-sessions/'+w.id+'/actions',{method:'POST',token,headers,body:{action,version:w.version,operationId:crypto.randomUUID(),setId:w.sets[w.cursor]?.id,...extra}});assert.equal(r.status,200,JSON.stringify(r.data));w=r.data.data;};
 assert.equal((await call('/api/v1/workout-sessions/'+w.id+'/actions',{method:'POST',token,headers:{'X-MoveMate-Recognition-Version':'3'},body:{action:'start',inputMode:'camera',operationId:crypto.randomUUID(),version:w.version}})).status,409);
 await send('start',{inputMode:'camera'});await send('progress',{reps:2,score:{count:0,total:0,depth:0,stability:0,trunk:0,symmetry:0}});await send('pause');assert.equal(w.sets[0].reps,2);await send('complete');await send('finish');assert.equal(w.session.xpEarned,0);await send('finish');assert.equal(w.session.xpEarned,0);
 }
 });
 await t.test('free workout editing, schedule preferences and checkpoint imports persist in native transactions',async()=>{
 const token=tokens[0];let r=await call('/api/v1/workout-sessions',{method:'POST',token,body:{id:crypto.randomUUID(),free:{exercises:[{exerciseId:'motion:squat',sets:[{reps:3}]}]}}});assert.equal(r.status,200,JSON.stringify(r.data));let w=r.data.data;
 const edit={operationId:crypto.randomUUID(),version:w.version,action:'edit',edit:{kind:'copy',targetId:w.sets[0].id}};
 const results=await Promise.all([call('/api/v1/workout-sessions/'+w.id+'/actions',{method:'POST',token,body:edit}),call('/api/v1/workout-sessions/'+w.id+'/actions',{method:'POST',token,body:edit})]);assert.ok(results.every(r=>r.status===200));assert.equal(results[1].data.data.sets.length,2);w=results[1].data.data;
 r=await call('/api/v1/workout-sessions/'+w.id+'/actions',{method:'POST',token,body:{operationId:crypto.randomUUID(),version:w.version,action:'start'}});assert.equal(r.status,200);w=r.data.data;
 r=await call('/api/v1/workout-sessions/'+w.id+'?recover=offline&version='+w.version,{token});assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.data.phase,'paused');assert.equal(r.data.data.recovery.previousVersion,w.version);w=r.data.data;
 r=await call('/api/v1/workout-sessions/'+w.id+'/actions',{method:'POST',token,body:{operationId:crypto.randomUUID(),version:w.version,action:'finish'}});assert.equal(r.status,200);assert.equal(r.data.data.session.xpEarned,0);
 assert.equal((await call('/api/v1/training-settings',{method:'PUT',token,body:{unit:'lb',effort:'rir'}})).data.data.unit,'lb');
 assert.equal((await call('/api/v1/training-settings',{token:tokens[1]})).data.data.unit,'kg');
 const payload={format:'movemate-gym',version:2,body:{items:[{date:'2026-09-02',weightKg:72}]}};
 const preview=(await call('/api/v1/training-imports/transfer-preview',{method:'POST',token,body:{format:'movemate',payload}})).data.data;
 const op={format:'movemate',payload,batchId:crypto.randomUUID(),part:0,total:1,manifest:[createHash('sha256').update(JSON.stringify(payload)).digest('hex')],previewHash:preview.previewHash};
 const first=await call('/api/v1/training-imports/transfer-commit',{method:'POST',token,body:op});assert.equal(first.status,200,JSON.stringify(first.data));assert.equal(first.data.data.cursor,1);
 const again=await call('/api/v1/training-imports/transfer-commit',{method:'POST',token,body:op});assert.equal(again.data.data.imported,first.data.data.imported);
 assert.equal((await call('/api/v1/training-imports/batches/'+op.batchId,{token:tokens[1]})).data.data.cursor,0);
 });
 await voicePoolTests(t,{mf,call,tokens,adminToken,sockets,password});
 }finally{for(const ws of sockets){try{ws.close()}catch{}}await mf.dispose()}
});
