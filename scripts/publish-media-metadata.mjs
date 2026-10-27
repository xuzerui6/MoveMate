import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..');
const manifest=JSON.parse(readFileSync(resolve(root,'client/src/features/gym/exercise-media.json'),'utf8'));
const destination=resolve(root,'client/public/exercise-media/details');mkdirSync(destination,{recursive:true});
const index={};
for(const [id,entry] of Object.entries(manifest.entries)){
  const text=JSON.stringify({exerciseId:id,...entry})+'\n',hash=createHash('sha256').update(text).digest('hex');
  const file=id.replace(/[^a-z0-9_-]/gi,'-')+'.'+hash.slice(0,12)+'.json';
  writeFileSync(resolve(destination,file),text);
  index[id]={thumb:entry.images[0]?.src||entry.video?.poster,kind:entry.kind||'photo',images:entry.images.length,video:!!entry.video,detail:'/exercise-media/details/'+file};
}
for(const file of ['client/src/features/gym/exercise-media-index.json','server/src/gym/media-index.json'])writeFileSync(resolve(root,file),JSON.stringify(index)+'\n');
console.log('Published lazy media records:',Object.keys(index).length);
