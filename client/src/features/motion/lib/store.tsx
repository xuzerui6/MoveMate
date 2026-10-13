import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import client, { getErrorMessage } from '../../../api/client';
import { useAuthStore } from '../../../stores/authStore';
import { equipmentSeed, initialState } from './data';
import { calculateDailyMissionProgress, calculateStreakDays } from './rewards';
import type { AppState, Slot, WorkoutSession } from '../types';
export type SportSession = { id:string; gameId:number|null; sportType:string; source:string; status:string; effectiveSeconds:number; reps:number; xpEarned:number; settled:boolean; startTime:string; endTime:string|null; metrics:any };
type Store = {
  state:AppState; sessions:SportSession[]; loading:boolean; loaded:boolean; error:string; refresh:()=>Promise<void>;
  startSession:(sportType:string,source:string,gameId?:number)=>Promise<SportSession>;
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
  const alive=useRef(true),requestId=useRef(0);
  const apply=useCallback((data:any)=>{
    if(!alive.current) return;
    const next=adapt(data);setState(next);setSessions(data.sessions||[]);setLoaded(true);
    localStorage.setItem('motion-buddy:account:'+userId,JSON.stringify({totalXp:next.totalXp,avatarGender:next.avatarGender,activeOutfit:next.activeOutfit}));
  },[userId]);
  const refresh=useCallback(async()=>{
    const current=++requestId.current;
    try {const res:any=await client.get('/training/state');if(current===requestId.current){apply(res.data);setError('');}}
    catch(err){if(alive.current)setError(getErrorMessage(err));}
    finally{if(alive.current)setLoading(false);}
  },[apply]);
  useEffect(()=>{alive.current=true;void refresh();const listener=()=>void refresh();const visibility=()=>{if(document.visibilityState==='visible')listener();};window.addEventListener('motion:refresh',listener);document.addEventListener('visibilitychange',visibility);return()=>{alive.current=false;window.removeEventListener('motion:refresh',listener);document.removeEventListener('visibilitychange',visibility);localStorage.removeItem('motion-buddy:account:'+userId);};},[refresh,userId]);
  const startSession=async(sportType:string,source:string,gameId?:number)=>{try{const res:any=await client.post('/sport-sessions',{id:crypto.randomUUID(),sportType,source,gameId});return res.data;}finally{await refresh();}};
  const act=async(id:string,action:string,data:any={})=>{try{const res:any=await client.post('/sport-sessions/'+id+'/'+action,data);return res.data;}finally{await refresh();}};
  const finishWorkout=async(raw:WorkoutSession)=>{
    const row=await act(raw.id,'finish',raw);
    const res:any=await client.get('/training/state');apply(res.data);
    return {...raw,...row.metrics,exerciseType:row.sportType,reps:row.reps,settled:row.settled,durationSeconds:row.effectiveSeconds,xpEarned:row.xpEarned,baseXpEarned:row.xpEarned,missionXpEarned:0,xpBefore:state.xp,xpAfter:res.data.xp,levelBefore:state.level,levelAfter:res.data.level,unlocked:res.data.ownedEquipment.filter((id:string)=>!state.equipment.find(e=>e.id===id)?.owned),unlockedOutfits:Object.keys(res.data.unlockedOutfits).filter(id=>res.data.unlockedOutfits[id]&&!(state.unlockedOutfits as any)[id]) as any};
  };
  const avatar=async(data:any)=>{try{const res:any=await client.patch('/training/avatar',data);apply(res.data);setError('');return true;}catch(err){setError(getErrorMessage(err));return false;}};
  return <Context.Provider value={{state,sessions,loading,loaded,error,refresh,startSession,act,finishWorkout,equip:(slot,id)=>avatar({equipped:{[slot]:id}}),setAvatarGender:avatarGender=>avatar({avatarGender}),setActiveOutfit:activeOutfit=>avatar({activeOutfit,seenOutfits:[activeOutfit]}),markOutfitsSeen:(seenOutfits=state.newlyUnlockedOutfits)=>avatar({seenOutfits})}}>
    {children}
  </Context.Provider>;
}
export function useStore(){const value=useContext(Context);if(!value)throw new Error('StoreProvider missing');return value;}
