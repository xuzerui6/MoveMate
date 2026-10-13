import { randomUUID } from 'node:crypto';
import { pool, withTransaction, afterCommit } from '../db';
import { ForbiddenError, InvalidStateError, NotFoundError, ValidationError } from '../utils/errors';
import { pushToUser, broadcastToGame } from '../websocket/notification.handler';

export const CAMERA_TYPES = new Set(['squat','jumping_jack','high_knees','push_up']);
export const SPORT_RATES: Record<string, number> = { running: 3, swimming: 3, basketball: 2, badminton: 2, soccer: 2, volleyball: 2, tennis: 2, table_tennis: 2 };
export function calculateXp(type: string, seconds: number, reps: number, source: string): number {
  if (source === 'demo') return 0;
  return CAMERA_TYPES.has(type) && source === 'camera' ? reps * 2 : Math.floor(seconds * (SPORT_RATES[type] || 1) / 60);
}
export function progress(totalXp: number) {
  let level = 1, xp = totalXp;
  while (xp >= 300 + (level - 1) * 100) { xp -= 300 + (level - 1) * 100; level++; }
  return { level, xp };
}
const equipment = ['penguin_hood', 'sunset_bandana', 'ocean_wave_top', 'purple_star_shorts', 'comet_running_shoes', 'sakura_gloves', 'shiba_bottle', 'emerald_star_medal'];
const slots: Record<string, string[]> = { head: ['penguin_hood','sunset_bandana'], top:['ocean_wave_top'], bottom:['purple_star_shorts'], shoes:['comet_running_shoes'], gloves:['sakura_gloves'], prop:['shiba_bottle'], badge:['emerald_star_medal'] };
const defaultEquipment = { head:'penguin_hood', top:'ocean_wave_top', bottom:'purple_star_shorts', shoes:'comet_running_shoes', prop:'shiba_bottle', badge:'emerald_star_medal' };
export interface SessionRow { id:string; user_id:number; game_id:number|null; sport_type:string; source:string; status:string; active_since:string|null; effective_ms:number; reps:number; metrics:string; xp:number; settled:number; created_at:string; ended_at:string|null }
function elapsed(row: SessionRow, now = Date.now()) { return Number(row.effective_ms) + (row.status === 'running' && row.active_since ? Math.max(0, now - Date.parse(row.active_since)) : 0); }
function decode<T>(raw: string, fallback: T): T { try { return JSON.parse(raw); } catch { return fallback; } }
export function sessionView(row: SessionRow) {
  return { id:row.id, gameId:row.game_id, sportType:row.sport_type, source:row.source, status:row.status, effectiveSeconds:Math.floor(elapsed(row)/1000), reps:row.reps, xpEarned:row.xp, settled:Boolean(row.settled), startTime:row.created_at, endTime:row.ended_at, metrics:decode(row.metrics,{}) };
}
async function owned(id:string, userId:number):Promise<SessionRow> {
  const row = (await pool.query<SessionRow>('SELECT * FROM sport_sessions WHERE id=$1 AND user_id=$2',[id,userId])).rows[0];
  if (!row) throw new NotFoundError('运动记录不存在');
  return row;
}
async function ensureGame(row: Pick<SessionRow,'game_id'|'user_id'>) {
  if (!row.game_id) return;
  const game = (await pool.query('SELECT g.status,gm.checked_in_at FROM games g JOIN game_members gm ON gm.game_id=g.id WHERE g.id=$1 AND gm.user_id=$2 AND gm.left_at IS NULL',[row.game_id,row.user_id])).rows[0];
  if (!game?.checked_in_at) throw new ForbiddenError('请先签到后开始运动');
  if (game.status !== 'in_progress') throw new InvalidStateError('活动开始后才能计时');
}
export async function createSession(userId:number, data:{ id?:string; sportType:string; source:string; gameId?:number }) {
  return withTransaction(async () => {
    const id = data.id || randomUUID();
    const old = (await pool.query<SessionRow>('SELECT * FROM sport_sessions WHERE id=$1',[id])).rows[0];
    if (old) {
      if (old.user_id !== userId) throw new ForbiddenError();
      if (old.source!==data.source || old.game_id!==(data.gameId||null) || (!data.gameId && old.sport_type!==data.sportType)) throw new InvalidStateError('运动记录的动作与来源不可更改');
      return sessionView(old);
    }
    if ((await pool.query('SELECT id FROM sport_sessions WHERE user_id=$1 AND status IN (\'running\',\'paused\')',[userId])).rowCount) throw new InvalidStateError('你已有运动记录，请先结束或恢复');
    let sport = data.sportType;
    if (data.gameId) {
      await ensureGame({game_id:data.gameId,user_id:userId});
      if (data.source !== 'timer') throw new ValidationError('组局使用个人计时');
      sport = (await pool.query('SELECT sport_type FROM games WHERE id=$1',[data.gameId])).rows[0].sport_type;
      if ((await pool.query('SELECT id FROM sport_sessions WHERE game_id=$1 AND user_id=$2',[data.gameId,userId])).rowCount) throw new InvalidStateError('已有该活动运动记录，请继续原记录');
    }
    if (!['camera','timer','demo'].includes(data.source)) throw new ValidationError('运动来源无效');
    if (data.source !== 'timer' && !CAMERA_TYPES.has(sport)) throw new ValidationError('不支持该摄像头动作');
    const now = new Date().toISOString();
    const row = (await pool.query<SessionRow>('INSERT INTO sport_sessions(id,user_id,game_id,sport_type,source,created_at,active_since) VALUES($1,$2,$3,$4,$5,$6,$6) RETURNING *',[id,userId,data.gameId || null,sport,data.source,now])).rows[0];
    await pool.query('INSERT INTO sport_intervals(session_id,started_at) VALUES($1,$2)',[id,now]);
    changed(row);
    return sessionView(row);
  });
}
function changed(row: SessionRow) {
  afterCommit(() => {
    if (row.game_id) broadcastToGame(row.game_id,'game_update',{gameId:row.game_id,changes:{sportSession:true}});
    return pushToUser(row.user_id,{id:0,type:'motion_changed',title:'',content:'',gameId:row.game_id,createdAt:new Date().toISOString()});
  });
}
function cleanMetrics(data:any, previous:any={}) {
  const out:any = { ...previous };
  for (const key of ['formScore','perfectReps','averageBpm','maxBpm','currentBpm','zone1Seconds','zone2Seconds','zone3Seconds','zone4Seconds','zone5Seconds','conversationTurnCount']) {
    const value = data?.[key];
    if (value === null) out[key]=null;
    else if (typeof value === 'number' && Number.isFinite(value) && value >= 0) out[key] = key === 'formScore' ? Math.min(100,value) : Math.min(100000,value);
  }
  if ('heartRateSource' in data) out.heartRateSource = data.heartRateSource === 'ble' ? 'ble' : null;
  for(const key of ['formBreakdown','correctionCounts']) {
    if (!data?.[key] || typeof data[key] !== 'object') continue;
    out[key] = { ...previous[key] };
    for(const field of (key === 'formBreakdown' ? ['depth','stability','trunk','symmetry'] : ['out_of_frame','insufficient_depth','knee_instability','excessive_trunk_lean','asymmetry','insufficient_range','unstable_movement','body_alignment','poor_coordination'])) {
      if (!(field in data[key])) continue;
      const n = data[key][field];out[key][field]=typeof n === 'number' && Number.isFinite(n) ? Math.max(0,Math.min(key === 'formBreakdown' ? 100 : 100000,n)) : 0;
    }
  }
  if (data.scoreAccumulator != null) {
    const acc=data.scoreAccumulator;
    if (!acc || !Number.isInteger(acc.count) || acc.count<0 || acc.count>100000) throw new ValidationError('评分累计次数无效');
    out.scoreAccumulator={count:acc.count};
    for(const key of ['total','depth','stability','trunk','symmetry']) {
      const n=acc[key];
      if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>acc.count*100)throw new ValidationError('评分累计值无效');
      out.scoreAccumulator[key]=n;
    }
    out.formScore=acc.count?Math.round(acc.total/acc.count):0;
    out.formBreakdown=Object.fromEntries(['depth','stability','trunk','symmetry'].map(k=>[k,acc.count?Math.round(acc[k]/acc.count):0]));
  }
  return out;
}
async function settle(row: SessionRow, eligible = true) {
  if (row.settled) return row;
  const xp = eligible ? calculateXp(row.sport_type,Math.floor(Number(row.effective_ms)/1000),row.reps,row.source) : 0;
  await pool.query('INSERT INTO motion_profiles(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING',[row.user_id]);
  const inserted = await pool.query('INSERT INTO xp_ledger(session_id,user_id,xp,created_at) VALUES($1,$2,$3,$4) ON CONFLICT(session_id) DO NOTHING RETURNING session_id',[row.id,row.user_id,xp,new Date().toISOString()]);
  if (inserted.rowCount) await pool.query('UPDATE motion_profiles SET total_xp=total_xp+$2 WHERE user_id=$1',[row.user_id,xp]);
  return (await pool.query<SessionRow>('UPDATE sport_sessions SET settled=1,xp=$2 WHERE id=$1 RETURNING *',[row.id,xp])).rows[0];
}
async function closeInterval(row:SessionRow, cutoff:number) {
  if(row.status !== 'running') return;
  await pool.query('UPDATE sport_intervals SET ended_at=$2,effective_ms=$3 WHERE session_id=$1 AND ended_at IS NULL',
    [row.id,new Date(cutoff).toISOString(),row.active_since ? Math.max(0,cutoff-Date.parse(row.active_since)) : 0]);
}
export async function sessionAction(id:string,userId:number,action:'pause'|'resume'|'finish'|'progress',data:any={}) {
  return withTransaction(async () => {
    let row = await owned(id,userId);
    if (row.settled) { if (action === 'finish') return sessionView(row); throw new InvalidStateError('运动已结算'); }
    if (row.game_id) await ensureGame(row);
    const now = new Date().toISOString();
    if (action === 'resume') {
      if (row.status !== 'running') {
        if ((await pool.query('SELECT id FROM sport_sessions WHERE user_id=$1 AND id!=$2 AND status IN (\'running\',\'paused\')',[userId,id])).rowCount) throw new InvalidStateError('请先结束另一项运动');
      }
    }
    if (action === 'resume' && row.status !== 'running') {
      row = (await pool.query<SessionRow>('UPDATE sport_sessions SET status=\'running\',active_since=$2,ended_at=NULL WHERE id=$1 RETURNING *',[id,now])).rows[0];
      await pool.query('INSERT INTO sport_intervals(session_id,started_at) VALUES($1,$2)',[id,now]);
    }
    if (action === 'pause' && row.status === 'running') {
      await closeInterval(row,Date.parse(now));
      row = (await pool.query<SessionRow>('UPDATE sport_sessions SET status=\'paused\',effective_ms=$2,active_since=NULL WHERE id=$1 RETURNING *',[id,elapsed(row,Date.parse(now))])).rows[0];
    }
    if (['pause','resume','progress','finish'].includes(action)) {
      if (data.reps != null && (!Number.isInteger(data.reps) || data.reps < 0 || data.reps > 100000)) throw new ValidationError('动作次数无效');
      const reps = row.source === 'timer' ? 0 : Math.max(row.reps,data.reps || 0);
      const oldMetrics=decode<any>(row.metrics,{});
      const stale=row.source!=='timer' && data.reps!=null && data.reps<row.reps;
      const cleaned=stale?oldMetrics:cleanMetrics(data,oldMetrics);
      if(cleaned.scoreAccumulator && cleaned.scoreAccumulator.count!==reps)throw new ValidationError('评分累计次数与动作次数不一致');
      const metrics=JSON.stringify(cleaned);
      if (action !== 'finish') row = (await pool.query<SessionRow>('UPDATE sport_sessions SET reps=$2,metrics=$3 WHERE id=$1 RETURNING *',[id,reps,metrics])).rows[0];
      else {
        await closeInterval(row,Date.parse(now));
        row = (await pool.query<SessionRow>('UPDATE sport_sessions SET status=\'finished\',effective_ms=$2,active_since=NULL,reps=$3,metrics=$4,ended_at=$5 WHERE id=$1 RETURNING *',[id,elapsed(row,Date.parse(now)),reps,metrics,now])).rows[0];
        if (!row.game_id) row = await settle(row);
      }
    }
    changed(row); return sessionView(row);
  });
}
export async function activeSession(userId:number) {
  const row = (await pool.query<SessionRow>('SELECT * FROM sport_sessions WHERE user_id=$1 AND status IN (\'running\',\'paused\')',[userId])).rows[0];
  return row ? sessionView(row) : null;
}
export async function settleGameSessions(game:any) {
  const members = (await pool.query('SELECT * FROM game_members WHERE game_id=$1 AND left_at IS NULL',[game.id])).rows;
  const checked = members.filter(m=>m.checked_in_at).length;
  const sessions = (await pool.query<SessionRow>('SELECT * FROM sport_sessions WHERE game_id=$1',[game.id])).rows;
  const cutoff = game.completed_at ? new Date(game.completed_at).getTime() : Date.now();
  const now = new Date(cutoff).toISOString();
  const notifications:any[] = [];
  for(let row of sessions) {
    if (row.settled) continue;
    const member = members.find(m=>Number(m.user_id) === row.user_id);
    const eligible = checked >= 2 && member?.checked_in_at && (row.user_id === game.host_id || member.attendance_confirmed_at);
    await closeInterval(row,cutoff);
    row=(await pool.query<SessionRow>('UPDATE sport_sessions SET status=\'finished\',effective_ms=$2,active_since=NULL,ended_at=COALESCE(ended_at,$3) WHERE id=$1 RETURNING *',[row.id,elapsed(row,cutoff),now])).rows[0];
    row=await settle(row,Boolean(eligible));changed(row);
    notifications.push({user_id:row.user_id,game_id:game.id,type:'reward_granted',title:'运动结算完成',content:`本次有效运动 ${Math.floor(row.effective_ms/1000)} 秒，获得 ${row.xp} XP${eligible ? '' : '（未满足到场确认条件）'}`});
  }
  for (const member of members) {
    if (!member.checked_in_at || (Number(member.user_id)!==game.host_id && !member.attendance_confirmed_at)) continue;
    await pool.query('UPDATE users SET completed_games=completed_games+1,hosted_completed_games=hosted_completed_games+$2 WHERE id=$1',[member.user_id,Number(member.user_id)===game.host_id ? 1 : 0]);
  }
  return notifications;
}
export async function trainingState(userId:number) {
  return withTransaction(async () => {
    await pool.query('INSERT INTO motion_profiles(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING',[userId]);
    const profile=(await pool.query('SELECT * FROM motion_profiles WHERE user_id=$1',[userId])).rows[0];
    const user=(await pool.query('SELECT nickname FROM users WHERE id=$1',[userId])).rows[0];
    const rows=(await pool.query<SessionRow>('SELECT * FROM sport_sessions WHERE user_id=$1 ORDER BY created_at DESC',[userId])).rows;
    const real=rows.filter(r=>r.settled && r.source!=='demo' && r.xp>0);
    const high=real.filter(r=>Number(decode<any>(r.metrics,{}).formScore || 0)>=90).length;
    const {level,xp}=progress(profile.total_xp);
    const runningUnlocked=real.length>=3, courtUnlocked=high>=3, outdoorUnlocked=(real.length>=5 && profile.total_xp>=1000)||level>=5;
    const unlockedOutfits={default:true,penguin:runningUnlocked,sakura:courtUnlocked,sunset_sakura:outdoorUnlocked,sea_runner:runningUnlocked,violet_court:courtUnlocked,sunlight_explorer:outdoorUnlocked};
    const seen=decode<string[]>(profile.seen_outfits,['default']);
    const ownedIds=equipment.filter(id=>id!=='sakura_gloves'||high>0);
    const history=rows.filter(r=>r.status==='finished').map(r=>({ ...decode<any>(r.metrics,{}), id:r.id, exerciseType:r.sport_type, sportType:r.sport_type, source:r.source, gameId:r.game_id, startTime:r.created_at,endTime:r.ended_at,durationSeconds:Math.floor(r.effective_ms/1000),reps:r.reps,targetReps:20,formScore:Number(decode<any>(r.metrics,{}).formScore||0),xpEarned:r.xp,settled:Boolean(r.settled),unlocked:[],unlockedOutfits:[] }));
    return {nickname:user.nickname,age:profile.age,totalXp:profile.total_xp,xp,level,avatarGender:profile.avatar_gender,activeOutfit:profile.active_outfit,unlockedOutfits,seenOutfits:seen,newlyUnlockedOutfits:Object.keys(unlockedOutfits).filter(k=>(unlockedOutfits as any)[k]&&!seen.includes(k)),equipped:{...defaultEquipment,...decode(profile.equipped,{})},ownedEquipment:ownedIds,completedWorkoutCount:real.length,workouts:real.length,highScoreWorkoutCount:high,totalSquats:real.filter(r=>r.sport_type==='squat').reduce((sum,r)=>sum+r.reps,0),history,sessions:rows.map(sessionView)};
  });
}
export async function updateAvatar(userId:number,data:any) {
  return withTransaction(async()=>{
    const state=await trainingState(userId);
    if (data.avatarGender && !['male','female'].includes(data.avatarGender)) throw new ValidationError('形象无效');
    if (data.activeOutfit && (!Object.prototype.hasOwnProperty.call(state.unlockedOutfits,data.activeOutfit) || !(state.unlockedOutfits as any)[data.activeOutfit])) throw new ForbiddenError('套装尚未解锁');
    const equipped={...state.equipped};
    for(const [slot,id] of Object.entries(data.equipped || {})) {
      if(!slots[slot]?.includes(id as string)||!state.ownedEquipment.includes(id as string)) throw new ForbiddenError('装备尚未解锁或部位不匹配');
      (equipped as any)[slot]=id;
    }
    const seen=[...new Set([...state.seenOutfits,...(Array.isArray(data.seenOutfits)?data.seenOutfits.filter((x:any)=>Object.prototype.hasOwnProperty.call(state.unlockedOutfits,x)&&(state.unlockedOutfits as any)[x]):[])])];
    await pool.query('UPDATE motion_profiles SET avatar_gender=$2,active_outfit=$3,equipped=$4,seen_outfits=$5 WHERE user_id=$1',[userId,data.avatarGender||state.avatarGender,data.activeOutfit||state.activeOutfit,JSON.stringify(equipped),JSON.stringify(seen)]);
    return trainingState(userId);
  });
}
