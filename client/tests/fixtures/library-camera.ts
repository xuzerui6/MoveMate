import type {NormalizedLandmark as Point} from '@mediapipe/tasks-vision';
import {demonstrationPose} from '../../src/features/motion/lib/exerciseMetrics';
import {planPose} from './plan-camera';
import type {LibraryRecognitionType} from '../../src/features/gym/libraryRecognition';
/** Synthetic points for explicitly labelled replay; not a real-camera recording. */
export function libraryPose(type:LibraryRecognitionType,stage:'neutral'|'peak'='neutral'){
  if(type==='goblet_squat'||type==='barbell_back_squat')return {landmarks:demonstrationPose('squat',stage),worldLandmarks:null};
  if(type==='barbell_curl')return {landmarks:planPose('biceps_curl',stage),worldLandmarks:null};
  const p:Point[]=Array.from({length:33},()=>({x:.5,y:.2,z:0,visibility:1}));
  const put=(i:number,x:number,y:number)=>{p[i]={x,y,z:0,visibility:1}};
  let world:Point[]|null=null;
  for(const o of [0,1]){
    const d=o*.06;
    if(type==='bench_press'){
      put(11+o,.25+d,.50);put(23+o,.65+d,.55);put(25+o,.78+d,.72);put(27+o,.88+d,.90);
      put(13+o,(stage==='peak'?.43:.25)+d,stage==='peak'?.53:.35);put(15+o,(stage==='peak'?.43:.25)+d,stage==='peak'?.35:.20);
    }else if(type==='seated_triceps_extension'){
      put(11+o,.43+d,.30);put(23+o,.43+d,.57);put(25+o,.65+d,.57);put(27+o,.65+d,.85);
      put(13+o,.43+d,.15);put(15+o,(stage==='peak'?.52:.43)+d,stage==='peak'?.24:.02);
    }else{
      const x=.53+o*.12;put(11+o,x,.32);put(23+o,x-.2,.56);put(25+o,x-.16,.75);
      put(13+o,stage==='peak'?(o?.79:.34):x,stage==='peak'?.32:.50);put(15+o,stage==='peak'?(o?.94:.15):x,stage==='peak'?.32:.68);
    }
  }
  if(type==='reverse_fly'){
    world=p.map(v=>({...v}));for(const o of [0,1]){
      const x=o?.2:-.2;
      world[11+o]={...world[11+o],x,y:0,z:-.3};world[23+o]={...world[23+o],x,y:.3,z:0};
      world[13+o]={...world[13+o],x:stage==='peak'?x+(o?.2:-.2):x,y:stage==='peak'?0:.2,z:-.3};
      world[15+o]={...world[15+o],x:stage==='peak'?x+(o?.4:-.4):x,y:stage==='peak'?0:.4,z:-.3};
    }
  }
  return {landmarks:p,worldLandmarks:world};
}
