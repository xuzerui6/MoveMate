import catalogue from './media-index.json';
type Capability={images:number;video:boolean};
export function reviewedMediaIds(filter:unknown,index:Record<string,Capability>=catalogue):Set<string>|null{
  if(filter==null)return null;
  if(filter!=='images'&&filter!=='video')throw new Error('Invalid media filter');
  return new Set(Object.keys(index).filter(id=>filter==='images'?index[id].images>0:index[id].video));
}
