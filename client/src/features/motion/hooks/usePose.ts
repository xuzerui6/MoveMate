import {useEffect} from 'react';
import {useLegacyPose} from './useLegacyPose';
import {useAdaptivePose,type AdaptiveOptions} from './useAdaptivePose';
export function usePose(active:boolean,options?:AdaptiveOptions&{adaptive:boolean}){
 const legacy=useLegacyPose(active&&!options?.adaptive),adaptive=useAdaptivePose(active&&!!options?.adaptive,options||{type:'squat',key:'unused',target:20,restored:{}});
 useEffect(()=>{if(options?.adaptive)legacy.stop();else adaptive.stop();},[options?.adaptive]);
 if(options?.adaptive)return {...adaptive,start:(lite=false)=>adaptive.start(lite)};
 return {...legacy,start:(_lite=false)=>legacy.start(),engine:null,frame:null,telemetry:null};
}
