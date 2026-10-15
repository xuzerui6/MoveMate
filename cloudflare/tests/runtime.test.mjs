import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { fixture, password } from './fixture.mjs';
const migrationSecret = 'm'.repeat(64);
const mf = new Miniflare(convertV4MiniflareOptions({ workers:[{name:'app',outboundService:'voice-provider', modules: true, scriptPath:'dist/test-worker.js', compatibilityDate:'2026-10-14', compatibilityFlags:['nodejs_compat'], durableObjects:{BACKEND:{className:'TestBackend',useSQLite:true},PROBE:{className:'RuntimeProbe',useSQLite:true}}, bindings:{INSTANCE:'test',JWT_SECRET:'j'.repeat(64),STUDENT_ID_SALT:'s'.repeat(64),XIAOZHI_COOKIE_SECRET:'x'.repeat(64),MIGRATION_SECRET:migrationSecret,NODE_ENV:'production',CLOUDFLARE:'1',XIAOZHI_IDENTITY_MODE:'personal'}, serviceBindings:{ASSETS:request=>new URL(request.url).pathname==='/assets/missing.js'?new Response('<html>SPA</html>',{headers:{'Content-Type':'text/html'}}):new Response('asset')} },{name:'voice-provider',modules:true,compatibilityDate:'2026-10-14',script:`
export default {async fetch(request){
 if(new URL(request.url).hostname==='api.tenclass.net')return Response.json({websocket:{url:'wss://voice.invalid/socket',token:'synthetic-test-token'}});
 if(request.headers.get('upgrade')!=='websocket')return new Response('missing upgrade',{status:400});
 const [client,server]=Object.values(new WebSocketPair());server.binaryType='arraybuffer';server.accept();
 server.addEventListener('message',event=>{if(typeof event.data==='string'){const m=JSON.parse(event.data);if(m.type==='hello')server.send(JSON.stringify({type:'hello',session_id:'synthetic-session',audio_params:{sample_rate:24000}}));else server.send(event.data);}else server.send(event.data)});
 return new Response(null,{status:101,webSocket:client});
}};`}] }));
const call = async (path, {method='GET',body,token,migration=false,headers={}}={}) => {
 const response=await mf.dispatchFetch('http://localhost'+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{}),...(migration?{Authorization:'Bearer '+migrationSecret}:{}),...headers},body:body?JSON.stringify(body):undefined});
 let data; const text=await response.text(); try{data=JSON.parse(text)}catch{data=text};return {status:response.status,data,headers:response.headers};
};
const migrate=(action,body)=>call('/api/migration/'+action,{method:body?'POST':'GET',body,migration:true});
let tokens=[],gameId;
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
 }finally{for(const ws of sockets){try{ws.close()}catch{}}await mf.dispose()}
});
