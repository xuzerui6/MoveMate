// Run with: node --import ./server/node_modules/tsx/dist/loader.mjs scripts/report-exercise-media.ts
import fs from 'node:fs';
import {exercises,templates} from '../server/src/gym/model';
import catalogue from '../client/src/features/gym/exercise-media.json';
const media=catalogue.entries as Record<string,any>;
const esc=(s:unknown)=>'"'+String(s??'').replaceAll('"','""')+'"';
const header=['exerciseId','中文名','原文名','真人图片帧数','原创图解帧数','连续视频','摄像头能力','文字审核','图文完整核对','待核对原因','审核阶段'];
const rows=exercises.map(e=>{const m=media[e.id];return [e.id,e.nameZh,e.name,m?.kind!=='illustration'?(m?.images.length||0):0,m?.kind==='illustration'?m.images.length:0,m?.video?'有':'待补',e.cameraType?'支持':e.planCamera?'试用':'手动',e.reviewStatus==='checked'?'已对照':'资料待核对',e.reviewStatus==='checked'&&m?'已完成':'未完成',e.reviewStatus==='checked'?'':e.reviewReason,e.reviewStage==='editorial'?'已对照具体资料':'仅结构检查，尚未人工核对'];});
fs.writeFileSync('docs/exercise-media-coverage.csv','\uFEFF'+[header,...rows].map(r=>r.map(esc).join(',')).join('\n')+'\n');
fs.writeFileSync('docs/exercise-media-missing.csv','\uFEFF'+[header,...rows.filter(r=>!media[String(r[0])])].map(r=>r.map(esc).join(',')).join('\n')+'\n');
const camera=exercises.filter(e=>e.cameraType||e.planCamera),templateIds=new Set(templates().flatMap(t=>t.routines.flatMap(r=>r.exercises.map(e=>e.exerciseId))));
console.log(JSON.stringify({total:exercises.length,images:Object.keys(media).length,videos:Object.values(media).filter(m=>m.video).length,missing:rows.filter(r=>!media[String(r[0])]).length,camera:camera.length,cameraImages:camera.filter(e=>media[e.id]).length,cameraPending:camera.filter(e=>!media[e.id]).map(e=>({id:e.id,name:e.nameZh})),templateIds:[...templateIds],templatesCovered:[...templateIds].filter(id=>media[id])},null,2));
