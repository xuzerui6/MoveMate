import {FilesetResolver,PoseLandmarker} from '@mediapipe/tasks-vision';
let model:PoseLandmarker|null=null;
const worker=self as unknown as {onmessage:(e:MessageEvent)=>void;postMessage:(value:unknown)=>void};
worker.onmessage=async({data})=>{
 try{
  if(data.kind==='init'){
   const vision=await FilesetResolver.forVisionTasks(data.wasm);
   model=await PoseLandmarker.createFromOptions(vision,{runningMode:'VIDEO',numPoses:1,minPoseDetectionConfidence:.55,minPosePresenceConfidence:.55,minTrackingConfidence:.55,baseOptions:{modelAssetBuffer:new Uint8Array(data.bytes),delegate:data.delegate},...(data.delegate==='GPU'?{canvas:new OffscreenCanvas(1,1)}:{})});
   worker.postMessage({id:data.id,ready:true});
  }else if(data.kind==='frame'){
   try{if(!model)throw Error('模型未准备');const r=model.detectForVideo(data.image,data.timestamp);worker.postMessage({id:data.id,landmarks:r.landmarks[0]||null,worldLandmarks:r.worldLandmarks[0]||null});}finally{data.image?.close();}
  }
 }catch(e){worker.postMessage({id:data.id,error:e instanceof Error?e.message:String(e)});}
};
