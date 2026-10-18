import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { NewPlanProfile } from '../../src/features/gym/planRecognition';
/** Synthetic landmarks for algorithm replay only, never a claim of real-camera validation. */
export function planPose(type:NewPlanProfile,stage:'neutral'|'peak'|'right'='neutral'):NormalizedLandmark[]{
  const p=Array.from({length:33},()=>({x:.5,y:.2,z:0,visibility:1}));
  const put=(i:number,x:number,y:number)=>{p[i]={x,y,z:0,visibility:1};};
  for(const o of [0,1]){const x=o?.57:.43;put(11+o,x,.28);put(13+o,x,.42);put(15+o,x,.56);put(23+o,o?.55:.45,.53);put(25+o,o?.55:.45,.72);put(27+o,o?.55:.45,.90);put(29+o,o?.54:.44,.92);put(31+o,o?.58:.48,.94);}
  if(type==='shoulder_press')for(const o of [0,1]){put(13+o,o?.71:.29,.37);put(15+o,o?.71:.29,.19);}
  if(type==='bent_over_row')for(const o of [0,1]){const shift=o*.07;put(11+o,.58+shift,.38+o*.02);put(23+o,.4+shift,.55+o*.02);put(13+o,.58+shift,.52+o*.02);put(15+o,.58+shift,.65+o*.02);}
  if(stage!=='neutral'){
    if(type==='biceps_curl')for(const o of [0,1])put(15+o,o?.55:.45,.31);
    if(type==='lateral_raise')for(const o of [0,1]){put(13+o,o?.71:.29,.28);put(15+o,o?.84:.16,.28);}
    if(type==='shoulder_press')for(const o of [0,1]){put(13+o,o?.57:.43,.14);put(15+o,o?.57:.43,.02);}
    if(type==='bent_over_row')for(const o of [0,1]){put(13+o,.46+o*.07,.37+o*.02);put(15+o,.55+o*.07,.43+o*.02);}
    if(type==='reverse_lunge'){
      for(const i of [11,12,23,24])p[i].y+=.1;
      const rear=stage==='right'?1:0,front=1-rear;put(25+rear,.32+rear*.1,.76);put(27+rear,.2+rear*.1,.90);put(29+rear,.19+rear*.1,.92);put(31+rear,.23+rear*.1,.94);put(25+front,.55+front*.1,.74);
    }
    if(type==='calf_raise')for(const i of [11,12,23,24,25,26,27,28,29,30])p[i].y-=.03;
  }
  return p;
}
