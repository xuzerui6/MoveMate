import definitions from '../../../../server/src/gym/library-recognition.json';
export type LibraryRecognitionType=keyof typeof definitions;
export const LIBRARY_RECOGNITION=definitions;
export const isLibraryRecognition=(value:string):value is LibraryRecognitionType=>Object.prototype.hasOwnProperty.call(definitions,value);
