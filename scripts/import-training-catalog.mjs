// Reproducible import of permissively licensed TEXT and original MIT geometry only.
// No openGym sources, Gym visual images, videos or media URLs are downloaded.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'..');
const sources={dataset:'7455efae41b330c265e7cd4b78dfa848e7ce5ebd',muscle:'5f576a5d3d697c3720abfada8e618d1cef08ea32'};
const raw=async(repo,sha,file)=>{const r=await fetch(`https://raw.githubusercontent.com/${repo}/${sha}/${file}`,{signal:AbortSignal.timeout(240000)});if(!r.ok)throw Error(`${file}: ${r.status}`);return r.text()};
await mkdir(resolve(root,'server/src/gym'),{recursive:true});await mkdir(resolve(root,'client/public/licenses'),{recursive:true});await mkdir(resolve(root,'client/src/features/gym'),{recursive:true});
const data=JSON.parse(await raw('hasaneyldrm/exercises-dataset',sources.dataset,'data/exercises.json'));
const rows=data.map(e=>({id:'exdb:'+e.id,name:e.name,bodyPart:e.body_part||e.bodyPart||e.category,equipment:e.equipment,target:e.target,secondaryMuscles:e.secondary_muscles||[],instructions:e.instruction_steps?.zh||e.instructions?.zh||e.instruction_steps?.en||e.instructions?.en||[],nameZh:e.names?.zh||e.name_zh||e.translations?.zh?.name||'',category:e.category||'strength'}));
await writeFile(resolve(root,'server/src/gym/catalog.json'),JSON.stringify(rows));
await writeFile(resolve(root,'client/public/licenses/Exercises-dataset-MIT.txt'),await raw('hasaneyldrm/exercises-dataset',sources.dataset,'LICENSE'));
const maps={};
for(const side of ['Front','Back']){
 const text=await raw('melihcolpan/MuscleMap',sources.muscle,`Sources/MuscleMap/Data/Male${side}Paths.swift`);
 maps[side.toLowerCase()]=[...text.matchAll(/BodyPartPathData\(\s*slug:\s*\.(\w+),([\s\S]*?)\n\s*\),?/g)].map(m=>({muscle:m[1],paths:[...m[2].matchAll(/"([Mm][^"]+)"/g)].map(v=>v[1])})).filter(x=>x.paths.length);
}
await writeFile(resolve(root,'client/src/features/gym/muscle-paths.json'),JSON.stringify(maps));
await writeFile(resolve(root,'client/public/licenses/MuscleMap-MIT.txt'),await raw('melihcolpan/MuscleMap',sources.muscle,'LICENSE'));
await writeFile(resolve(root,'server/src/gym/sources.json'),JSON.stringify({sources,count:rows.length,textOnly:true,mediaIncluded:false},null,2)+'\n');
console.log(JSON.stringify({count:rows.length,first:rows[0],maps:Object.fromEntries(Object.entries(maps).map(([k,v])=>[k,v.length]))}));
