import {test} from 'node:test';
import assert from 'node:assert/strict';
import {XiaozhiAudio} from '../src/features/motion/lib/xiaozhiAudio';

test('worklet initialization failure releases the microphone on every retry',async t=>{
  const scope=globalThis as any;
  const saved=new Map(['window','navigator','AudioContext'].map(key=>[key,Object.getOwnPropertyDescriptor(scope,key)]));
  t.after(()=>{for(const [key,descriptor] of saved){if(descriptor)Object.defineProperty(scope,key,descriptor);else delete scope[key]}});
  let captures=0,stopped=0;
  class Context {
    state='running';
    audioWorklet={addModule:async(url:string)=>{assert.equal(url,'/audio/motion-buddy-mic.worklet.js');throw new Error('worklet load failed')}};
    async close(){this.state='closed'}
  }
  Object.defineProperty(scope,'window',{configurable:true,value:{AudioEncoder:class{},AudioDecoder:class{},AudioData:class{},EncodedAudioChunk:class{},AudioWorkletNode:class{}}});
  Object.defineProperty(scope,'AudioContext',{configurable:true,value:Context});
  Object.defineProperty(scope,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:async()=>{captures++;return {getTracks:()=>[{stop:()=>{stopped++}}]}}}}});
  const audio=new XiaozhiAudio(()=>assert.fail('failed capture must not send audio'),()=>{});
  for(let i=1;i<=2;i++){await assert.rejects(audio.startCapture(),/worklet load failed/);assert.equal(stopped,i)}
  await audio.dispose();assert.equal(captures,2);assert.equal(stopped,2);
});
