import definitions from './new-recognition.json';
import library from './library-recognition.json';
import {InvalidStateError} from '../utils/errors';
export const isExtendedRecognition=(type:string)=>Object.prototype.hasOwnProperty.call(definitions,type);
export function requireRecognitionVersion(type:string,version:unknown){
  const profile=(library as Record<string,{recognitionVersion?:number}>)[type];
  const minimum=profile?.recognitionVersion||3;
  if((profile&&(!Number.isInteger(Number(version))||Number(version)<minimum||Number(version)>6))||(isExtendedRecognition(type)&&![2,3,4,5,6].includes(Number(version))))throw new InvalidStateError('当前页面不支持此新动作，请刷新页面后恢复训练');
}
export function requireStrategyVersion(strategy:unknown,version:unknown){if(strategy==='adaptive-v1'&&Number(version)!==6)throw new InvalidStateError('新版识别记录需要刷新页面后恢复，旧页面不能提交此统计');}
