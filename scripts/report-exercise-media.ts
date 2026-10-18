// Run with: node --import ./server/node_modules/tsx/dist/loader.mjs scripts/report-exercise-media.ts
import fs from 'node:fs';
import {exercises,templates} from '../server/src/gym/model';
import catalogue from '../client/src/features/gym/exercise-media.json';
const media=catalogue.entries as Record<string,any>;
const esc=(s:unknown)=>'"'+String(s??'').replaceAll('"','""')+'"';
const header=['exerciseId','中文名','原文名','图片数量','连续视频','摄像头能力','素材状态'];
const rows=exercises.map(e=>[e.id,e.nameZh,e.name,media[e.id]?.images.length||0,media[e.id]?.video?'有':'待补',e.cameraType?'支持':e.planCamera?'试用':'手动',media[e.id]?'已核对来源和变式':'示范待补']);
fs.writeFileSync('docs/exercise-media-coverage.csv','\uFEFF'+[header,...rows].map(r=>r.map(esc).join(',')).join('\n')+'\n');
fs.writeFileSync('docs/exercise-media-missing.csv','\uFEFF'+[header,...rows.filter(r=>!media[String(r[0])])].map(r=>r.map(esc).join(',')).join('\n')+'\n');
const camera=exercises.filter(e=>e.cameraType||e.planCamera),templateIds=new Set(templates().flatMap(t=>t.routines.flatMap(r=>r.exercises.map(e=>e.exerciseId))));
console.log(JSON.stringify({total:exercises.length,images:Object.keys(media).length,videos:Object.values(media).filter(m=>m.video).length,missing:rows.filter(r=>!media[String(r[0])]).length,camera:camera.length,cameraImages:camera.filter(e=>media[e.id]).length,cameraPending:camera.filter(e=>!media[e.id]).map(e=>({id:e.id,name:e.nameZh})),templateIds:[...templateIds],templatesCovered:[...templateIds].filter(id=>media[id])},null,2));
