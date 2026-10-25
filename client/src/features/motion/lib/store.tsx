import {readCache,writeCache} from '../../gym/offline';
import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import client, { getErrorMessage } from '../../../api/client';
import { useAuthStore } from '../../../stores/authStore';
import { equipmentSeed, initialState } from './data';
import { calculateDailyMissionProgress, calculateStreakDays } from './rewards';
import { SessionQueue, reconcileMutation } from './sessionRuntime';
import type { AppState, Slot, WorkoutSession } from '../types';
export type SportSession = { id:string; workoutId?:string; gameId:number|null; sportType:string; source:string; status:string; effectiveSeconds:number; reps:number; xpEarned:number; settled:boolean; startTime:string; endTime:string|null; metrics:any; receivedAt?:number };
type Store = {
  state:AppState; sessions:SportSession[]; loading:boolean; loaded:boolean; source:'server'|'cache'|'unavailable'; error:string; refresh:()=>Promise<void>;
  startSession:(sportType:string,source:string,gameId?:number)=>Promise<SportSession>;
  lookupSession:(id:string)=>Promise<SportSession|undefined>;
  act:(id:string,action:string,data?:any)=>Promise<SportSession>;
  finishWorkout:(session:WorkoutSession)=>Promise<WorkoutSession>;
  equip:(slot:Slot,id:string)=>Promise<boolean>; setAvatarGender:(gender:AppState['avatarGender'])=>Promise<boolean>;
  setActiveOutfit:(outfit:AppState['activeOutfit'])=>Promise<boolean>; markOutfitsSeen:(outfits?:AppState['newlyUnlockedOutfits'])=>Promise<boolean>;
};
const Context=createContext<Store|null>(null);
const adapt=(data:any):AppState=>{
  const history=(data.history||[]).map((item:any)=>({...item,currentBpm:item.currentBpm??null,averageBpm:item.averageBpm??null,maxBpm:item.maxBpm??null,heartRateSource:item.heartRateSource??null,zone1Seconds:item.zone1Seconds||0,zone2Seconds:item.zone2Seconds||0,zone3Seconds:item.zone3Seconds||0,zone4Seconds:item.zone4Seconds||0,zone5Seconds:item.zone5Seconds||0,perfectReps:item.perfectReps||0,visionInsights:[],formBreakdown:item.formBreakdown||{depth:0,stability:0,trunk:0,symmetry:0},correctionCounts:item.correctionCounts||{}}));
  const real=history.filter((item:any)=>item.source!=='demo' && item.settled);
  return {...initialState,...data,history,equipment:equipmentSeed.map(item=>({...item,owned:data.ownedEquipment.includes(item.id)})),dailyMissionProgress:calculateDailyMissionProgress(real),streakDays:calculateStreakDays(real)};
};
export function StoreProvider({children}:{children:React.ReactNode}) {
  const userId=useAuthStore(s=>s.user?.id);
  const [state,setState]=useState(initialState),[sessions,setSessions]=useState<SportSession[]>([]),[loading,setLoading]=useState(true),[loaded,setLoaded]=useState(false),[error,setError]=useState('');
  const [source,setSource]=useState<'server'|'cache'|'unavailable'>('unavailable');
  const alive=useRef(true),requestId=useRef(0),lastWrite=useRef(0);
  const stateRef=useRef(state);stateRef.current=state;
  const apply=useCallback((data:any)=>{
    if(!alive.current) return;
    const next=adapt(data);stateRef.current=next;setState(next);const receivedAt=Date.now();setSessions((data.sessions||[]).map((row:SportSession)=>({...row,receivedAt})));setLoaded(true);
    try{localStorage.setItem('motion-buddy:account:'+userId,JSON.stringify({totalXp:next.totalXp,avatarGender:next.avatarGender,activeOutfit:next.activeOutfit}));}catch{/* A full local cache must not invalidate confirmed server growth. */}
  },[userId]);
  const refresh=useCallback(async()=>{
    if(!alive.current)return;
    const current=++requestId.current,requestToken=localStorage.getItem("token");
    setLoading(true);
    try {const res:any=await client.get('/training/state');if(alive.current&&current===requestId.current&&localStorage.getItem("token")===requestToken&&useAuthStore.getState().user?.id===userId){apply(res.data);setSource('server');if(userId!=null)writeCache(userId,'/training/state',res.data);setError('');}}
    catch(err){if(alive.current&&current===requestId.current){const cached=userId!=null&&!(err as any)?.response?readCache(userId,'/training/state'):null;if(cached){apply(cached.data);setSource('cache');setError('当前显示本人只读缓存，联网后核对训练状态');}else {setSource('unavailable');setError(getErrorMessage(err));}}}
    finally{if(alive.current&&current===requestId.current)setLoading(false);}
  },[apply]);
  useEffect(()=>{alive.current=true;void refresh();const listener=()=>{if(Date.now()-lastWrite.current>1500)void refresh();};const online=()=>void refresh();const visibility=()=>{if(document.visibilityState==='visible')void refresh();};window.addEventListener('motion:refresh',listener);window.addEventListener('online',online);document.addEventListener('visibilitychange',visibility);return()=>{alive.current=false;window.removeEventListener('motion:refresh',listener);window.removeEventListener('online',online);document.removeEventListener('visibilitychange',visibility);try{localStorage.removeItem('motion-buddy:account:'+userId);}catch{}};},[refresh,userId]);
  const acceptRow=(raw:SportSession)=>{
    const row={...raw,receivedAt:Date.now()};
    if(alive.current){requestId.current++;setLoading(false);setSessions(current=>[row,...current.filter(item=>item.id!==row.id)]);}
    return row;
  };
  const lookupSession=async(id:string)=>{
    if(!alive.current || useAuthStore.getState().user?.id!==userId)throw new Error('账号已切换，请重新进入训练');
    const res:any=await client.get('/training/state');
    if(!alive.current)return undefined;
    const row=res.data.sessions?.find((item:SportSession)=>item.id===id);
    return row?acceptRow(row):undefined;
  };
  const queue=useRef<SessionQueue<SportSession>|null>(null);
  const uncertain=useRef(new Set<string>()),pendingStart=useRef<{id:string;key:string}|null>(null);
  if(!queue.current)queue.current=new SessionQueue<SportSession>(async(id,action,data)=>{
    if(!alive.current || useAuthStore.getState().user?.id!==userId)throw new Error('账号已切换，请重新进入训练');
    lastWrite.current=Date.now();
    try {return await reconcileMutation(uncertain.current,id,action,data,
      async()=>{if(!alive.current || useAuthStore.getState().user?.id!==userId)throw new Error('账号已切换，请重新进入训练');const res:any=await client.post('/sport-sessions/'+id+'/'+action,data);return acceptRow(res.data);},
      ()=>lookupSession(id));
    }finally{lastWrite.current=Date.now();}
  });
  const startSession=async(sportType:string,source:string,gameId?:number)=>{
    if(!alive.current || useAuthStore.getState().user?.id!==userId)throw new Error('账号已切换，请重新进入训练');
    const key=JSON.stringify([sportType,source,gameId]);
    if(!pendingStart.current || pendingStart.current.key!==key)pendingStart.current={id:crypto.randomUUID(),key};
    const id=pendingStart.current.id;lastWrite.current=Date.now();
    try {const res:any=await client.post('/sport-sessions',{id,sportType,source,gameId});pendingStart.current=null;return acceptRow(res.data);}
    catch(error){
      const row=await lookupSession(id).catch(()=>undefined);
      if(row && row.sportType===sportType && row.source===source){pendingStart.current=null;return row;}
      // A competing tab may own the active record. Recover it at the entry rather than create another.
      await refresh();throw error;
    }finally{lastWrite.current=Date.now();}
  };
  const act=async(id:string,action:string,data:any={})=>{
    const row=await queue.current!.run(id,action,data);
    if(action==='finish')await refresh();
    return row;
  };
  const finishWorkout=async(raw:WorkoutSession)=>{
    const before=stateRef.current;
    const row=await queue.current!.run(raw.id,'finish',raw);
    if(!alive.current || useAuthStore.getState().user?.id!==userId)throw new Error('账号已切换，原运动可在原账号查看');
    let growth:any=null;
    try {const res:any=await client.get('/training/state');growth=res.data;apply(growth);setError('');}
    catch(error){if(alive.current)setError(getErrorMessage(error));}
    return {...raw,...row.metrics,exerciseType:row.sportType,reps:row.reps,settled:row.settled,durationSeconds:row.effectiveSeconds,endTime:row.endTime,xpEarned:row.xpEarned,baseXpEarned:row.xpEarned,missionXpEarned:0,growthPending:!growth,
      xpBefore:before.xp,xpAfter:growth?.xp,levelBefore:before.level,levelAfter:growth?.level,
      unlocked:growth?growth.ownedEquipment.filter((id:string)=>!before.equipment.find(e=>e.id===id)?.owned):[],
      unlockedOutfits:growth?Object.keys(growth.unlockedOutfits).filter(id=>growth.unlockedOutfits[id]&&!(before.unlockedOutfits as any)[id]) as any:[]};
  };
  const avatar=async(data:any)=>{if(!alive.current || useAuthStore.getState().user?.id!==userId)return false;try{const res:any=await client.patch('/training/avatar',data);if(!alive.current)return false;apply(res.data);setError('');return true;}catch(err){if(alive.current)setError(getErrorMessage(err));return false;}};
  return <Context.Provider value={{state,sessions,loading,loaded,source,error,refresh,startSession,lookupSession,act,finishWorkout,equip:(slot,id)=>avatar({equipped:{[slot]:id}}),setAvatarGender:avatarGender=>avatar({avatarGender}),setActiveOutfit:activeOutfit=>avatar({activeOutfit,seenOutfits:[activeOutfit]}),markOutfitsSeen:(seenOutfits=state.newlyUnlockedOutfits)=>avatar({seenOutfits})}}>
    {children}
  </Context.Provider>;
}
export function useStore(){const value=useContext(Context);if(!value)throw new Error('StoreProvider missing');return value;}
