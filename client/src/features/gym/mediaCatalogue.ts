// Build/test audit access. The rendered application loads details by immutable URL.
import catalogue from './exercise-media.json';
import type {ExerciseMedia} from './media';
export const exerciseMedia=catalogue.entries as Record<string,ExerciseMedia>;
export const demonstratedIds=Object.keys(exerciseMedia);
export const mediaFor=(id:string|undefined)=>id?exerciseMedia[id]:undefined;
