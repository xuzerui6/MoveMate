import {useEffect,useState} from 'react';
import {mediaSummaryFor,type ExerciseMedia} from './media';
const cache=new Map<string,ExerciseMedia>();
const pending=new Map<string,Promise<ExerciseMedia>>();
export async function loadMedia(id:string):Promise<ExerciseMedia>{
  const info=mediaSummaryFor(id);if(!info)throw Error('此动作还没有已核验的动作图');
  const cached=cache.get(info.detail);if(cached)return cached;
  const inFlight=pending.get(info.detail);if(inFlight)return inFlight;
  const job=(async()=>{
    const response=await fetch(info.detail);if(!response.ok)throw Error('示范资料加载失败，请重试');
    const data=await response.json();
    if(data.exerciseId!==id||!Array.isArray(data.images)||!Array.isArray(data.sources)||data.images.length!==info.images||!!data.video!==info.video)throw Error('示范资料与当前动作不一致，请重新读取');
    cache.set(info.detail,data);if(cache.size>64)cache.delete(cache.keys().next().value!);return data;
  })();pending.set(info.detail,job);
  try{return await job;}finally{pending.delete(info.detail);}
}
export function useExerciseMedia(id:string){
  const [state,setState]=useState<{id:string;media:ExerciseMedia|null;loading:boolean;error:string}>({id,media:null,loading:!!mediaSummaryFor(id),error:''});
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{let alive=true;if(!mediaSummaryFor(id)){setState({id,media:null,loading:false,error:''});return;}
    setState({id,media:null,loading:true,error:''});void loadMedia(id).then(media=>{if(alive)setState({id,media,loading:false,error:''});}).catch(error=>{if(alive)setState({id,media:null,loading:false,error:!navigator.onLine?'当前离线，此动作的示范资料尚未缓存；可继续查看文字。':error instanceof Error&&error.message.includes('示范资料')?error.message:'示范资料加载失败，请重试'});});return()=>{alive=false;};
  },[id,attempt]);
  return {...(state.id===id?state:{id,media:null,loading:!!mediaSummaryFor(id),error:''}),retry:()=>setAttempt(v=>v+1)};
}
