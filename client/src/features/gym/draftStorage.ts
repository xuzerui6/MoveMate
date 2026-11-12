type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type DraftRead<T> = {state: 'missing' | 'valid' | 'invalid' | 'unavailable'; value?: T};
export function readDraft<T>(key: string, valid: (value: any) => boolean, storage?: Store): DraftRead<T> {
  let raw: string | null;
  try { raw = (storage || localStorage).getItem(key); }
  catch { return {state: 'unavailable'}; }
  if (raw === null) return {state: 'missing'};
  try { const value = JSON.parse(raw); return valid(value) ? {state: 'valid', value} : {state: 'invalid'}; }
  catch { return {state: 'invalid'}; }
}
export function writeDraft(key: string, value: any, storage?: Store) {
  try { (storage || localStorage).setItem(key, JSON.stringify(value)); return true; }
  catch { return false; }
}
export function removeDraft(key: string, storage?: Store) {
  try { (storage || localStorage).removeItem(key); return true; }
  catch { return false; }
}
export const draftWriteWarning = '草稿没存上，刷新会丢掉没保存的修改；现在还能继续改，联网后可以存到账号里。';
export function validPlanDraft(p: any): boolean {
  return !!p && typeof p.name === 'string' && ['weekly','rotation'].includes(p.mode) &&
    !!p.progression && typeof p.progression.mode === 'string' && Array.isArray(p.routines) &&
    p.routines.length > 0 && p.routines.length <= 14 && p.routines.every((r: any) =>
      r && typeof r.id === 'string' && typeof r.name === 'string' && Array.isArray(r.weekdays) &&
      r.weekdays.every((n: any) => Number.isInteger(n) && n >= 0 && n <= 6) && Array.isArray(r.exercises) &&
      r.exercises.every((e: any) => e && typeof e.exerciseId === 'string' && Array.isArray(e.sets) &&
        e.sets.length > 0 && e.sets.every((s: any) => s &&
          ['reps','seconds','loadKg','restSec'].every(k => typeof s[k] === 'number' && Number.isFinite(s[k])))));
}
