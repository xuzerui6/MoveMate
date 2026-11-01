/** A resolved play() promise does not guarantee Safari has decoded its first camera frame. */
export function waitForVideoFrame(video:HTMLVideoElement,signal:AbortSignal,timeoutMs=8000):Promise<void>{
 return new Promise((resolve,reject)=>{
  let interval:ReturnType<typeof setInterval>|undefined,timer:ReturnType<typeof setTimeout>|undefined;
  const cleanup=()=>{clearInterval(interval);clearTimeout(timer);signal.removeEventListener('abort',abort);};
  const abort=()=>{cleanup();reject(new Error('摄像头准备已取消'));};
  const check=()=>{if(video.readyState>=2&&video.videoWidth>0&&video.videoHeight>0){cleanup();resolve();return true;}return false;};
  if(signal.aborted){abort();return;}if(check())return;
  signal.addEventListener('abort',abort,{once:true});interval=setInterval(check,50);timer=setTimeout(()=>{cleanup();reject(new Error('摄像头尚未输出有效画面，请保持页面在前台，关闭其他占用摄像头的应用后重试'));},timeoutMs);
 });
}
