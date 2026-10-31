import type {NormalizedLandmark as Point} from '@mediapipe/tasks-vision';
import {demonstrationPose} from '../../src/features/motion/lib/exerciseMetrics';
import {planPose} from './plan-camera';
import type {LibraryRecognitionType} from '../../src/features/gym/libraryRecognition';
/** Synthetic points for explicitly labelled replay; not a real-camera recording. */
export function libraryPose(type:LibraryRecognitionType,stage:'neutral'|'peak'='neutral'){
  if(type==='goblet_squat'||type==='barbell_back_squat'||type==='barbell_front_squat')return {landmarks:demonstrationPose('squat',stage),worldLandmarks:null};
  if(type==='barbell_row')return {landmarks:planPose('bent_over_row',stage),worldLandmarks:null};
  if(type==='neutral_seated_press')return {landmarks:planPose('shoulder_press',stage),worldLandmarks:null};
  if(type==='dumbbell_calf_raise')return {landmarks:planPose('calf_raise',stage),worldLandmarks:null};
  if(type==='barbell_curl'||type==='reverse_barbell_curl')return {landmarks:planPose('biceps_curl',stage),worldLandmarks:null};
  const p:Point[]=Array.from({length:33},()=>({x:.5,y:.2,z:0,visibility:1}));
  const put=(i:number,x:number,y:number)=>{p[i]={x,y,z:0,visibility:1}};
  let world:Point[]|null=null;
  for(const o of [0,1]){
    const d=o*.06;
    if(type==='seated_curl'||type==='seated_lateral_raise'){
      put(11+o,.43+d,.30);put(23+o,.43+d,.57);put(25+o,.65+d,.57);put(27+o,.65+d,.85);
      put(13+o,type==='seated_lateral_raise'&&stage==='peak'?(o?.71:.29):.43+d,type==='seated_lateral_raise'&&stage==='peak'?.3:.42);
      put(15+o,type==='seated_lateral_raise'&&stage==='peak'?(o?.9:.1):(stage==='peak'?.48:.43)+d,type==='seated_lateral_raise'&&stage==='peak'?.3:stage==='peak'?.32:.54);
    }else if(type==='lying_triceps_extension'){
      put(11+o,.25+d,.5);put(23+o,.65+d,.55);put(25+o,.78+d,.72);put(27+o,.88+d,.9);put(13+o,.25+d,.35);put(15+o,(stage==='peak'?.13:.25)+d,stage==='peak'?.37:.2);
    }else if(type==='barbell_deadlift'){
      const down=stage==='neutral';put(11+o,(down?.61:.52)+d,down?.40:.25);put(23+o,(down?.42:.52)+d,down?.60:.53);put(25+o,(down?.60:.52)+d,down?.73:.72);put(27+o,.52+d,.90);put(13+o,(down?.60:.52)+d,down?.60:.45);put(15+o,(down?.59:.52)+d,down?.83:.65);
    }else if(type==='bench_press'||type==='incline_bench_press'){
      put(11+o,type==='incline_bench_press'?.35+d:.25+d,type==='incline_bench_press'?.25:.50);put(23+o,.65+d,.55);put(25+o,.78+d,.72);put(27+o,.88+d,.90);
      if(type==='incline_bench_press'){put(13+o,(stage==='peak'?.51:.35)+d,stage==='peak'?.29:.15);put(15+o,(stage==='peak'?.51:.35)+d,stage==='peak'?.13:.03);}else{put(13+o,(stage==='peak'?.43:.25)+d,stage==='peak'?.53:.35);put(15+o,(stage==='peak'?.43:.25)+d,stage==='peak'?.35:.20);}
    }else if(type==='seated_triceps_extension'){
      put(11+o,.43+d,.30);put(23+o,.43+d,.57);put(25+o,.65+d,.57);put(27+o,.65+d,.85);
      put(13+o,.43+d,.15);put(15+o,(stage==='peak'?.52:.43)+d,stage==='peak'?.24:.02);
    }else{
      const x=.53+o*.12;put(11+o,x,.32);put(23+o,x-.2,.56);put(25+o,x-.16,.75);
      put(13+o,stage==='peak'?(o?.79:.34):x,stage==='peak'?.32:.50);put(15+o,stage==='peak'?(o?.94:.15):x,stage==='peak'?.32:.68);
    }
  }
  if(type==='seated_lateral_raise'){
    world=p.map(v=>({...v}));for(const o of [0,1]){const x=o?.2:-.2;
      world[11+o]={...world[11+o],x,y:0,z:0};world[23+o]={...world[23+o],x,y:.4,z:0};world[25+o]={...world[25+o],x,y:.4,z:.3};world[27+o]={...world[27+o],x,y:.8,z:.3};
      world[13+o]={...world[13+o],x:stage==='peak'?x+(o?.2:-.2):x,y:stage==='peak'?0:.2,z:0};world[15+o]={...world[15+o],x:stage==='peak'?x+(o?.4:-.4):x,y:stage==='peak'?0:.4,z:0};
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
