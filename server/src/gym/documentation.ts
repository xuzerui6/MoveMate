import reviewed from './reviewed-content.json';
import type {Exercise} from './model';

export type Documentation = {
  nameZh?: string;
  aliases?: string[];
  instructions?: string[];
  category?: string;
  cues: string[];
  form: string;
  reviewStatus: 'checked'|'needs_review';
  reviewReason: string;
};
// Official catalogue only. Custom exercises and stored workout snapshots do not
// pass through this function, so a matching name cannot grant reviewed status.
export function documented<T extends Exercise>(exercise:T):T & Partial<Documentation> {
  const entry=(reviewed as Record<string,Documentation>)[exercise.id];
  if(!entry)return {...exercise,reviewStatus:'needs_review',reviewReason:'尚未完成此动作的文字与变式逐项核对；现有步骤为来源资料，示范待补。'};
  const nameZh=(entry.nameZh||exercise.nameZh).replace(/V型\.\s*(\d+)/g,'（变式 $1）').replace(/([\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/g,'$1');
  return {...exercise,...entry,nameZh,aliases:[...new Set([...((exercise as any).aliases||[]),...(entry.aliases||[]),exercise.name,exercise.nameZh,nameZh])]} as T & Documentation;
}
