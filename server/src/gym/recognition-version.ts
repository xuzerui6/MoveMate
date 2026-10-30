import definitions from './new-recognition.json';
import {InvalidStateError} from '../utils/errors';
export const isExtendedRecognition=(type:string)=>Object.prototype.hasOwnProperty.call(definitions,type);
export function requireRecognitionVersion(type:string,version:unknown){
  if(isExtendedRecognition(type)&&Number(version)!==2)throw new InvalidStateError('当前页面不支持此新动作，请刷新页面后恢复训练');
}
