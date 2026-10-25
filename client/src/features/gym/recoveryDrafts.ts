import {readDraft, writeDraft, removeDraft} from './draftStorage';
import {changedFields, sameContent} from './editingState';

export type RecoveryDraft<T = any> = {format: 'movemate-draft'; version: 2; base: T | null; value: T};
export const recoveryDraft = <T,>(base: T | null, value: T): RecoveryDraft<T> =>
  ({format:'movemate-draft',version:2,base:base == null ? null : structuredClone(base),value:structuredClone(value)});
export function validRecoveryDraft(value: any, valid: (v: any) => boolean) {
  return value?.format === 'movemate-draft' && value.version === 2 &&
    (value.base === null || valid(value.base)) && valid(value.value);
}
export function readRecoveryDraft(key: string, valid: (v: any) => boolean) {
  const result = readDraft<any>(key, v => validRecoveryDraft(v, valid) || valid(v));
  return {...result, value: result.state === 'valid'
    ? validRecoveryDraft(result.value, valid) ? result.value as RecoveryDraft : recoveryDraft(null,result.value)
    : undefined};
}
export function archivedDrafts(key: string, valid: (v: any) => boolean) {
  return readDraft<RecoveryDraft[]>(key+':conflicts', v => Array.isArray(v) && v.every(x => validRecoveryDraft(x,valid)));
}
/** Never overwrite the active draft unless its original content has a separate copy. */
export function archiveDraft(key: string, draft: RecoveryDraft, valid: (v: any) => boolean) {
  const stored = archivedDrafts(key,valid);
  if (stored.state === 'invalid' || stored.state === 'unavailable') return false;
  const values = stored.value || [];
  return values.some(v => sameContent(v,draft)) || writeDraft(key+':conflicts',[...values,draft]);
}
export function forgetDraft(key: string, draft: RecoveryDraft, valid: (v: any) => boolean) {
  const stored=archivedDrafts(key,valid);
  if (stored.state==='invalid' || stored.state==='unavailable') return false;
  const values=(stored.value||[]).filter(v=>!sameContent(v,draft));
  return values.length ? writeDraft(key+':conflicts',values) : removeDraft(key+':conflicts');
}
export function restoreFields(server: any, draft: RecoveryDraft) {
  const edits = draft.base ? changedFields(draft.base,draft.value) : changedFields(server,draft.value);
  const safe: any={}, conflicts: string[]=[];
  for (const [key,value] of Object.entries(edits)) {
    if (draft.base && (sameContent(server[key],draft.base[key]) || sameContent(server[key],value))) safe[key]=value;
    else conflicts.push(key);
  }
  return {value:{...server,...safe},conflicts};
}
export const validSettingsDraft = (v: any) => !!v && ['kg','lb'].includes(v.unit) && typeof v.timeZone==='string' &&
  ['off','rpe','rir'].includes(v.effort) && Array.isArray(v.equipment) && v.equipment.every((x:any)=>typeof x==='string');

export const settingNames: Record<string,string> = {unit:'显示单位',timeZone:'日程时区',effort:'用力程度',sound:'声音提醒',wakeLock:'屏幕常亮',equipment:'拥有器械',barKg:'空杆重量 kg',plates:'杠铃片配置',goalKg:'目标体重 kg'};
export function settingValue(key: string, value: any): string {
  if (value == null) return '未设置';
  if (typeof value==='boolean') return value?'开启':'关闭';
  if (key==='effort') return ({off:'关闭',rpe:'RPE',rir:'RIR'} as any)[value] || String(value);
  if (key==='plates' && Array.isArray(value)) return value.map(p=>`${p.kg} kg × ${p.count} 片`).join('，') || '无';
  return Array.isArray(value)?value.join('，')||'无':String(value);
}
