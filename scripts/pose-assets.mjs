import {readFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
export function verifyPoseModels(){
 const models=JSON.parse(readFileSync(resolve(root,'client/src/features/motion/lib/pose-models.json'),'utf8'));
 return Object.entries(models).map(([name,info])=>{if(!['lite','full','heavy'].includes(name)||info.src!==`/pose/pose_landmarker_${name}.task`||info.version!=='float16/1')throw Error('Invalid pinned pose model');const served=info.parts?.length?info.parts:[info.src];const buffers=served.map(part=>{const path=resolve(root,'client/public'+part);if(statSync(path).size>=25*1024*1024)throw Error('Pose model file exceeds the hosting per-file limit: '+part);return readFileSync(path);});const whole=Buffer.concat(buffers);if(whole.length!==info.bytes||createHash('sha256').update(whole).digest('hex')!==info.sha256)throw Error('Pose model integrity check failed: '+name);return{name,bytes:whole.length,sha256:info.sha256};});
}
export function poseAssetsPlugin(){return {name:'verified-local-pose-models',buildStart(){verifyPoseModels();},configureServer(){verifyPoseModels();}};}
