import definitions from './new-recognition.json';
import library from './library-recognition.json';
import {InvalidStateError} from '../utils/errors';
export const isExtendedRecognition=(type:string)=>Object.prototype.hasOwnProperty.call(definitions,type);
export function requireRecognitionVersion(type:string,version:unknown){
  if((Object.prototype.hasOwnProperty.call(library,type)&&Number(version)!==3)||(isExtendedRecognition(type)&&![2,3].includes(Number(version))))throw new InvalidStateError('当前页面不支持此新动作，请刷新页面后恢复训练');
}
