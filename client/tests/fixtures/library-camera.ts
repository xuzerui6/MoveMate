import type {NormalizedLandmark as Point} from '@mediapipe/tasks-vision';
import {demonstrationPose} from '../../src/features/motion/lib/exerciseMetrics';
import {planPose} from './plan-camera';
import type {LibraryRecognitionType} from '../../src/features/gym/libraryRecognition';
/** Synthetic points for explicitly labelled replay; not a real-camera recording. */
export function libraryPose(type:LibraryRecognitionType,stage:'neutral'|'peak'='neutral'){
  if(type==='goblet_squat'||type==='barbell_back_squat'||type==='barbell_front_squat')return {landmarks:demonstrationPose('squat',stage),worldLandmarks:null};
  if(type==='barbell_row')return {landmarks:planPose('bent_over_row',stage),worldLandmarks:null};
  if(type==='neutral_seated_press')return {landmarks:planPose('shoulder_press',stage),worldLandmarks:null};
  if(type==='dumbbell_standing_press'||type==='barbell_military_press')return {landmarks:planPose('shoulder_press',stage),worldLandmarks:null};
  if(type==='dumbbell_reverse_lunge')return {landmarks:planPose('reverse_lunge',stage),worldLandmarks:null};
  if(type==='dumbbell_calf_raise')return {landmarks:planPose('calf_raise',stage),worldLandmarks:null};
  if(type==='barbell_curl'||type==='reverse_barbell_curl')return {landmarks:planPose('biceps_curl',stage),worldLandmarks:null};
  const p:Point[]=Array.from({length:33},()=>({x:.5,y:.2,z:0,visibility:1}));
  const put=(i:number,x:number,y:number)=>{p[i]={x,y,z:0,visibility:1}};
  let world:Point[]|null=null;
  if(type==='lying_leg_raise'){
    // Supine side view: torso on the bench along −x, legs extend +x; the peak
    // lifts both legs straight up (hip ≈90°), neutral lies flat (hip ≈178°).
    for(const o of [0,1]){const d=o*.02;
      put(11+o,.22+d,.55);put(13+o,.20+d,.68);put(15+o,.30+d,.72);
      put(23+o,.48+d,.57);
      if(stage==='peak'){put(25+o,.50+d,.30);put(27+o,.52+d,.06);put(29+o,.50+d,.06);put(31+o,.55+d,.06);}
      else{put(25+o,.72+d,.58);put(27+o,.92+d,.58);put(29+o,.90+d,.58);put(31+o,.95+d,.58);}
    }
    return {landmarks:p,worldLandmarks:null};
  }
  if(type==='upright_row'){
    // Frontal: peak flares the elbows out to shoulder height with the wrists
    // up at chest level (elbow ≈22°); neutral hangs the arms straight down.
    for(const o of [0,1]){const d=o*.12;
      put(11+o,.44+d,.30);put(23+o,.45+d,.55);put(25+o,.45+d,.74);put(27+o,.45+d,.90);
      if(stage==='peak'){put(13+o,.33+d,.30);put(15+o,.43+d,.26);}
      else{put(13+o,.435+d,.44);put(15+o,.44+d,.60);}
    }
    return {landmarks:p,worldLandmarks:null};
  }
  if(type==='mountain_climber'){
    // Plank side view, head at −x. Neutral has both legs extended; the peak
    // pose tucks the LEFT leg only (hip ≈55°, knee ≈103°) — one drive.
    for(const o of [0,1]){const d=o*.02;
      put(11+o,.28+d,.40);put(13+o,.29+d,.58);put(15+o,.30+d,.76);
      put(23+o,.50+d,.43);
      if(stage==='peak'&&o===0){put(25,.36,.58);put(27,.48,.76);put(29,.46,.76);put(31,.51,.76);}
      else{put(25+o,.70+d,.46);put(27+o,.88+d,.50);put(29+o,.86+d,.50);put(31+o,.91+d,.50);}
    }
    return {landmarks:p,worldLandmarks:null};
  }
  if(type==='split_squat'){
    // Side view facing +x (heels behind ankles, toes ahead): LEFT leg front
    // on the floor, RIGHT foot back and elevated. Peak sinks the body — the
    // front knee reaches ≈117° while the feet stay planted.
    const down=stage==='peak';
    for(const o of [0,1]){
      put(11+o,.46+o*.03,down?.34:.26);put(13+o,.45+o*.03,down?.50:.42);put(15+o,.45+o*.03,down?.64:.58);
    }
    put(23,.44,down?.56:.48);put(24,.52,down?.56:.48);
    if(down){put(25,.575,.715);put(27,.50,.90);put(26,.42,.76);put(28,.30,.60);}
    else{put(25,.47,.68);put(27,.50,.90);put(26,.40,.64);put(28,.24,.62);}
    put(29,.46,.905);put(31,.55,.905);put(30,.20,.625);put(32,.29,.625);
    return {landmarks:p,worldLandmarks:null};
  }
  if(type==='seated_calf_raise'){
    // Seated side view: thigh horizontal, shin vertical (knee ≈97°) in both
    // stages; the peak raises the heel while the toe stays planted.
    for(const o of [0,1]){const d=o*.03;
      put(11+o,.44+d,.16);put(13+o,.43+d,.30);put(15+o,.50+d,.38);
      put(23+o,.44+d,.40);put(25+o,.60+d,.42);
      if(stage==='peak'){put(27+o,.60+d,.735);put(29+o,.575+d,.825);}
      else{put(27+o,.60+d,.76);put(29+o,.575+d,.86);}
      put(31+o,.665+d,.86);
    }
    return {landmarks:p,worldLandmarks:null};
  }
  if(type==='barbell_good_morning'){
    // The romanian hinge geometry: standing straight at neutral, hinged to
    // hip ≈111° with near-straight knees at the peak.
    for(const o of [0,1]){const d=o*.02;
      put(23+o,stage==='peak'?.47+d:.50+d,stage==='peak'?.53:.52);
      put(11+o,stage==='peak'?.72+d:.50+d,stage==='peak'?.40:.24);
      put(13+o,stage==='peak'?.70+d:.50+d,stage==='peak'?.54:.38);
      put(15+o,stage==='peak'?.68+d:.50+d,stage==='peak'?.68:.54);
      put(25+o,stage==='peak'?.49+d:.51+d,.71);put(27+o,stage==='peak'?.50+d:.51+d,.90);
    }
    return {landmarks:p,worldLandmarks:null};
  }
  if(type==='bench_dip'){
    // Side view: hands planted on the bench behind, knees bent, feet forward.
    // The peak drops the shoulders ≈0.11 (≈0.5 torso) with elbows ≈100°.
    for(const o of [0,1]){const d=o*.02;
      put(23+o,.45+d,stage==='peak'?.60:.53);put(25+o,.63+d,stage==='peak'?.62:.55);put(27+o,.64+d,.88);
      put(11+o,.40+d,stage==='peak'?.41:.30);
      if(stage==='peak'){put(13+o,.27+d,.47);put(15+o,.30+d,.58);}
      else{put(13+o,.365+d,.45);put(15+o,.30+d,.58);}
    }
    return {landmarks:p,worldLandmarks:null};
  }
  for(const o of [0,1]){
    const d=o*.06;
    if(type==='seated_curl'||type==='seated_lateral_raise'){
      put(11+o,.43+d,.30);put(23+o,.43+d,.57);put(25+o,.65+d,.57);put(27+o,.65+d,.85);
      put(13+o,type==='seated_lateral_raise'&&stage==='peak'?(o?.71:.29):.43+d,type==='seated_lateral_raise'&&stage==='peak'?.3:.42);
      put(15+o,type==='seated_lateral_raise'&&stage==='peak'?(o?.9:.1):(stage==='peak'?.48:.43)+d,type==='seated_lateral_raise'&&stage==='peak'?.3:stage==='peak'?.32:.54);
    }else if(type==='lying_triceps_extension'){
      put(11+o,.25+d,.5);put(23+o,.65+d,.55);put(25+o,.78+d,.72);put(27+o,.88+d,.9);put(13+o,.25+d,.35);put(15+o,(stage==='peak'?.13:.25)+d,stage==='peak'?.37:.2);
    }else if(type==='one_arm_row'){
      // Bent over (plan bent_over_row torso geometry); both arms hang at neutral,
      // the left arm pulls at peak while the right arm keeps hanging as support.
      put(11+o,.58+d,.38+o*.02);put(23+o,.40+d,.55+o*.02);put(25+o,.40+d,.74+o*.02);put(27+o,.40+d,.90);
      if(stage==='peak'&&o===0){put(13+o,.46,.37);put(15+o,.55,.43);}else{put(13+o,.58+d,.52+o*.02);put(15+o,.58+d,.66+o*.02);}
    }else if(type==='barbell_deadlift'||type==='dumbbell_deadlift'){
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
