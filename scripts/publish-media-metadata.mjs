import {readFileSync,writeFileSync,mkdirSync,renameSync,unlinkSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
const root=resolve(import.meta.dirname,'..');
const manifest=JSON.parse(readFileSync(resolve(root,'client/src/features/gym/exercise-media.json'),'utf8'));
const destination=resolve(root,'client/public/exercise-media/details');mkdirSync(destination,{recursive:true});
async function publish(file,text){
  try{if(readFileSync(file,'utf8')===text)return;}catch(error){if(error.code!=='ENOENT')throw error;}
  // Replace complete files atomically. Windows indexers may briefly lock the
  // destination; retry that transient condition without truncating live data.
  const temporary=file+'.'+randomUUID()+'.tmp';
  try{
    writeFileSync(temporary,text,{flag:'wx'});
    for(let attempt=0;;attempt++){
      try{renameSync(temporary,file);break;}
      catch(error){if(attempt>=4||!['UNKNOWN','EBUSY','EPERM','EACCES'].includes(error.code))throw error;await new Promise(r=>setTimeout(r,50*(attempt+1)));}
    }
  }finally{try{unlinkSync(temporary);}catch(error){if(error.code!=='ENOENT')throw error;}}
}
const index={};
for(const [id,entry] of Object.entries(manifest.entries)){
  const text=JSON.stringify({exerciseId:id,...entry})+'\n',hash=createHash('sha256').update(text).digest('hex');
  const file=id.replace(/[^a-z0-9_-]/gi,'-')+'.'+hash.slice(0,12)+'.json';
  await publish(resolve(destination,file),text);
  index[id]={thumb:entry.images[0]?.src||entry.video?.poster,kind:entry.kind||'photo',images:entry.images.length,video:!!entry.video,detail:'/exercise-media/details/'+file};
}
for(const file of ['client/src/features/gym/exercise-media-index.json','server/src/gym/media-index.json'])await publish(resolve(root,file),JSON.stringify(index)+'\n');
console.log('Published lazy media records:',Object.keys(index).length);
