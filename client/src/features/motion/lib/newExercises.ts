import definitions from '../../../../../server/src/gym/new-recognition.json';
export type NewExerciseType = keyof typeof definitions;
export const NEW_EXERCISES = definitions;
export const RECOGNITION_VERSION = 3;
export const isNewExercise = (value:string):value is NewExerciseType => Object.prototype.hasOwnProperty.call(definitions,value);
