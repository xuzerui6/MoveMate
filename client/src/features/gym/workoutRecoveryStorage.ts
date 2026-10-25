type StorageLike = Pick<Storage,'getItem'|'setItem'|'removeItem'>;
const sessions = new Map<string,WorkoutRecoveryStorage>();
export const recoveryStorageWarning='未能保存到本机，请勿刷新或关闭；联网后先核对服务器，未上传的内容无法保证在刷新后恢复。';
export class WorkoutRecoveryStorage {
  pending: any = null;
  checkpoint: {setId:string;values:any}|null = null;
  network = 0;
  unknown = false;
  warning = '';
  private disposed = false;
  private listeners = new Set<() => void>();
  constructor(public key: string, private storage: StorageLike) {
    const read=(load:()=>void)=>{try{load();}catch{this.unknown=true;this.warning='本机同步记录无法读取，已停止操作；请先读取服务器恢复已保存内容。';}};
    read(()=>{
      const raw=storage.getItem(key);
      if(raw){const p=JSON.parse(raw);if(!p || typeof p.operationId!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.operationId) || !Number.isInteger(p.version) || p.version<1 || !['start','resume','pause','progress','complete','skip','finish','heartbeat','rest','edit','manual'].includes(p.action))throw Error();this.pending=p;}
    });
    read(()=>{
      const network=storage.getItem(key+':network');
      if(network){const n=Number(network);if(!Number.isInteger(n)||n<0)throw Error();this.network=n;}
    });
    read(()=>{
      const frozen=storage.getItem(key+':snapshot');
      if(frozen){const c=JSON.parse(frozen);if(!c||typeof c.setId!=='string'||!c.values||!Number.isFinite(c.values.reps)||c.values.reps<0)throw Error();this.checkpoint=c;}
    });
  }
  subscribe(listener:()=>void){this.listeners.add(listener);return()=>{this.listeners.delete(listener);};}
  private emit(){this.listeners.forEach(fn=>fn());}
  private persist(key:string,value:any){
    if(this.disposed)return;
    try {value===null?this.storage.removeItem(key):this.storage.setItem(key,JSON.stringify(value));}
    catch {this.warning=recoveryStorageWarning;}
    this.emit();
  }
  getPending(){if(this.disposed)throw Error('账号会话已结束');if(this.unknown)throw Error('本机同步记录尚未核对，请读取服务器恢复同步');return this.pending;}
  setPending(value:any){if(this.disposed)return;this.pending=value===null?null:structuredClone(value);this.persist(this.key,this.pending);}
  setCheckpoint(value:typeof this.checkpoint){if(this.disposed)return;this.checkpoint=value===null?null:structuredClone(value);this.persist(this.key+':snapshot',this.checkpoint);}
  setNetwork(version:number){if(this.disposed)return;this.network=version;this.persist(this.key+':network',version||null);}
  get blocked(){return this.unknown || !!this.pending || !!this.network || !!this.checkpoint;}
  dispose(){this.disposed=true;this.pending=null;this.checkpoint=null;this.network=0;this.unknown=true;this.listeners.clear();}
  /** Only a fresh server read may replace an unreadable local record. */
  acknowledgeRead(){
    if(this.disposed||!this.unknown)return;
    // The network marker can be damaged while its operation is still valid.
    // Preserve the operation already reconciled by the fresh read.
    this.unknown=false;this.network=0;
    this.warning='旧同步记录无法读取，当前已恢复服务器保存的内容；未上传数据可能无法找回。';
    this.persist(this.key,this.pending);this.persist(this.key+':network',null);this.persist(this.key+':snapshot',this.checkpoint);
  }
}
/** Never apply the last frame to another set, or reduce a camera's saved count. */
export function checkpointUpdate(checkpoint:WorkoutRecoveryStorage['checkpoint'],row:any){
  if(!checkpoint)return null;
  const current=row.sets[row.cursor];
  if(row.phase==='finished'||current?.id!==checkpoint.setId||!['working','paused'].includes(row.phase))throw Error('服务器已结束或切换了本组，未上传快照已保留；请核对后选择服务器记录。');
  if(current.inputMode==='camera')return checkpoint.values.reps>current.reps?{reps:checkpoint.values.reps,score:checkpoint.values.score}:null;
  return null;
}
export function getWorkoutRecoveryStorage(uid:string|number,workoutId:string,storage?:StorageLike){
  const key=`gym:pending:${uid}:${workoutId}`;
  let value=sessions.get(key);
  if(!value){
    let target=storage;
    if(!target)try{target=localStorage;}catch{target={getItem:()=>{throw Error('storage unavailable')},setItem:()=>{throw Error('storage unavailable')},removeItem:()=>{throw Error('storage unavailable')}};}
    value=new WorkoutRecoveryStorage(key,target);sessions.set(key,value);
  }
  return value;
}
export function clearWorkoutRecoveryStorage(uid:string|number){
  for(const [key,value] of sessions)if(key.startsWith(`gym:pending:${uid}:`)){value.dispose();sessions.delete(key);}
}
