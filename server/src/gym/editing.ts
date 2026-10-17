import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { pool } from '../db';
import { InvalidStateError, ValidationError } from '../utils/errors';
import { json, setSchema, type Exercise } from './model';

// Called only inside actWorkout's owner/version/idempotency transaction.
export async function editWorkout(w: any, current: any, input: any, catalog: Exercise[]) {
  const edit = z.object({
    kind: z.enum(['add','copy','replace','move','remove','undo']),
    targetId: z.string().optional(), exerciseId: z.string().optional(),
    beforeId: z.string().optional(), target: setSchema.optional(),
  }).parse(input);
  if (['working','paused'].includes(w.phase))
    throw new InvalidStateError('请先暂停并完成或跳过当前组，再调整训练安排');
  const rows = (await pool.query('SELECT * FROM gym_sets WHERE workout_id=$1 ORDER BY position', [w.id])).rows;
  const selected = rows.find(r=>r.id===edit.targetId);
  const pending = (r:any)=>r && r.status==='pending';
  const assertPending = ()=>{if(!pending(selected)) throw new InvalidStateError('只能调整尚未开始的组；已发生运动的记录会保留');};
  let added: any;
  if(edit.kind==='add' || edit.kind==='copy') {
    if(rows.length>=500) throw new ValidationError('每次训练最多500组');
    if(edit.kind==='copy' && (!selected || selected.status==='removed')) throw new ValidationError('找不到可复制的组');
    const old = selected ? json(selected.data) : null;
    const exercise = edit.kind==='copy' ? old.exercise : catalog.find(e=>e.id===edit.exerciseId && !(e as any).archived);
    if(!exercise) throw new ValidationError('动作不存在或已归档');
    const target = setSchema.parse(edit.target || (old ? {...old,loadKg:selected.load_g/1000} : {}));
    added={id:randomUUID(),workout_id:w.id,status:'pending',data:JSON.stringify({...target,exercise,exerciseIndex:rows.length,setIndex:0,adjusted:true}),load_g:Math.round(target.loadKg*1000)};
    rows.push(added);
  } else if(edit.kind==='replace') {
    assertPending();
    const exercise=catalog.find(e=>e.id===edit.exerciseId && !(e as any).archived);
    if(!exercise) throw new ValidationError('动作不存在或已归档');
    selected.data=JSON.stringify({...json(selected.data),...(edit.target||{}),exercise,adjusted:true});
  } else if(edit.kind==='remove') { assertPending(); selected.status='removed'; }
  else if(edit.kind==='undo') {
    if(!selected || selected.status!=='removed') throw new InvalidStateError('这组无法撤销删除');
    selected.status='pending';
    rows.splice(rows.indexOf(selected),1); rows.push(selected);
  } else {
    assertPending();
    const before=rows.find(r=>r.id===edit.beforeId);
    if(!pending(before)) throw new InvalidStateError('只能在未开始的组之间调整顺序');
    rows.splice(rows.indexOf(selected),1); rows.splice(rows.indexOf(before),0,selected);
  }
  // Completed records are immutable and precede the editable queue. Tombstones retain IDs for undo.
  const ordered=[...rows.filter(r=>!['pending','removed'].includes(r.status)),...rows.filter(pending),...rows.filter(r=>r.status==='removed')];
  await pool.query('UPDATE gym_sets SET position=-position-1 WHERE workout_id=$1',[w.id]);
  for(const [position,r] of ordered.entries()) {
    if(r===added) await pool.query('INSERT INTO gym_sets(id,workout_id,position,data,load_g) VALUES($1,$2,$3,$4,$5)',[r.id,w.id,position,r.data,r.load_g]);
    else await pool.query('UPDATE gym_sets SET position=$2,data=$3,status=$4 WHERE id=$1',[r.id,position,r.data,r.status]);
  }
  const cursor=ordered.findIndex(pending);
  await pool.query('UPDATE gym_workouts SET cursor=$2 WHERE id=$1',[w.id,cursor<0?ordered.length:cursor]);
}
