export function mediaFiles(entries: Record<string, any>): any[];
export function isPublicBuild(options?: Record<string, any>): boolean;
export function verifyExerciseMedia(options?: Record<string, any>): any[];
export function installExerciseMedia(output: string, options?: Record<string, any>): number;
export function exerciseMediaPlugin(): import('../client/node_modules/vite').Plugin;
