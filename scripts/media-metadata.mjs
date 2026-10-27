import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
export function verifyMediaMetadata(root,manifest){
  const read=p=>JSON.parse(readFileSync(resolve(root,p),'utf8'));
  const client=read('client/src/features/gym/exercise-media-index.json'),server=read('server/src/gym/media-index.json');
  if(JSON.stringify(client)!==JSON.stringify(server))throw Error('Client and server media capabilities differ; run publish-media-metadata.mjs');
  if(Object.keys(client).length!==Object.keys(manifest.entries).length)throw Error('Stale media capability count');
  for(const [id,m] of Object.entries(manifest.entries)){
    const summary=client[id];
    if(!summary||summary.images!==m.images.length||summary.video!==!!m.video||summary.kind!==(m.kind||'photo')||summary.thumb!==(m.images[0]?.src||m.video?.poster))throw Error('Stale media capability: '+id);
    if(!/^\/exercise-media\/details\/[a-z0-9_-]+\.[a-f0-9]{12}\.json$/.test(summary.detail))throw Error('Invalid media detail path');
    const bytes=readFileSync(resolve(root,'client/public/.'+summary.detail));
    const hash=createHash('sha256').update(bytes).digest('hex');
    if(!summary.detail.includes('.'+hash.slice(0,12)+'.json')||JSON.stringify(JSON.parse(bytes))!==JSON.stringify({exerciseId:id,...m}))throw Error('Stale or modified media detail: '+id);
  }
  return Object.keys(client).length;
}
