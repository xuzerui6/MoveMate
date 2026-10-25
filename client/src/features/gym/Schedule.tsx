import InstallApp from "./InstallApp";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";
import { CachedDataNotice } from "./CachedDataNotice";
import { recoveryDraft, readRecoveryDraft, archivedDrafts, archiveDraft, forgetDraft, restoreFields, validSettingsDraft, settingNames, settingValue, type RecoveryDraft } from "./recoveryDrafts";
import { SnapshotEditor, sameContent, changedFields } from "./editingState";
import { writeDraft, removeDraft, draftWriteWarning } from "./draftStorage";
import { Header } from "../motion/components/Header";
import {
  useGymQuery,
  request,
  getErrorMessage,
  beginWorkout,
  label,
} from "./api";
export function TrainingSettings() {
  const q = useGymQuery("/training-settings"),
    lib = useGymQuery("/exercises?limit=1"),
    [message, setMessage] = useState(""),
    [failed, setFailed] = useState(false),
    [busy, setBusy] = useState(false),
    navigate = useNavigate();
  const uid = useAuthStore(s => s.user?.id), draftKey = "gym:draft:"+uid+":settings";
  const token=useRef(localStorage.getItem('token')).current;
  const protectedDraft=useRef<RecoveryDraft|null>(null), unreadActive=useRef(false), resolvedArchives=useRef<RecoveryDraft[]>([]);
  const [reviews,setReviews]=useState<RecoveryDraft[]>([]), [review,setReview]=useState<{record:RecoveryDraft;server:any;keys:string[];current?:boolean}|null>(null), [selected,setSelected]=useState<string[]>([]);
  const editor = useRef<SnapshotEditor<any> | null>(null), base = useRef<any>(null), alive = useRef(true);
  const [v, setValue] = useState<any>(null), [storageWarning,setStorageWarning] = useState(""), [invalidDraft,setInvalidDraft] = useState(false);
  useEffect(() => {alive.current=true;return () => {alive.current=false;};},[]);
  const readOnly = q.loading || !!q.error || !q.data || !!q.data.__offline;
  useEffect(() => {
    if (!q.data || editor.current?.busy || editor.current?.dirty || editor.current?.uncertain) return;
    const {__offline,...server} = q.data;
    base.current=server;
    const draft=readRecoveryDraft(draftKey,validSettingsDraft), archived=archivedDrafts(draftKey,validSettingsDraft);
    if(archived.state==='invalid'||archived.state==='unavailable')setStorageWarning('设置冲突草稿存档无法读取，原内容已保留；不会用新草稿覆盖。');
    let list=archived.value||[];
    let value=server;
    if(draft.value){
      const restored=restoreFields(server,draft.value);value=restored.value;
      if(restored.conflicts.length){
        if(!archiveDraft(draftKey,draft.value,validSettingsDraft))protectedDraft.current=draft.value;
        if(!list.some(d=>sameContent(d,draft.value)))list=[...list,draft.value];
        setReview({record:draft.value,server,keys:restored.conflicts});setSelected([]);
        setMessage(draft.value.base?'有字段双方都已修改，请逐项确认。':'旧格式草稿缺少基线，默认不覆盖任何字段。');
      }else setMessage('已恢复本人修改，服务器其他字段保持最新');
    }
    setReviews(list);
    editor.current=new SnapshotEditor(value,!sameContent(server,value));setValue(editor.current.value);
    if(draft.state==='invalid'){setInvalidDraft(true);unreadActive.current=true;setStorageWarning('本机设置草稿损坏，未覆盖原内容。');}
    if(draft.state==='unavailable'){unreadActive.current=true;setStorageWarning('本机草稿无法读取，仍可编辑并联网保存；原内容不会被覆盖。');}
  },[q.data]);
  const persist = () => {
    if(unreadActive.current){
      const original=readRecoveryDraft(draftKey,validSettingsDraft);
      if(original.state==='invalid'||original.state==='unavailable'){setStorageWarning('原草稿仍无法读取，新编辑仅在内存中，请勿刷新。');return;}
      protectedDraft.current=original.value||null;unreadActive.current=false;
    }
    if(protectedDraft.current){if(!archiveDraft(draftKey,protectedDraft.current,validSettingsDraft)){setStorageWarning('原草稿未能单独备份，已保护原稿；新编辑仅在内存中，请勿刷新或关闭。');return;}protectedDraft.current=null;}
    const ok=editor.current!.dirty?writeDraft(draftKey,recoveryDraft(base.current,editor.current!.value)):removeDraft(draftKey);
    setStorageWarning(ok?'':editor.current!.dirty?draftWriteWarning:'设置已保存，但本机草稿暂时无法清理。');
    if(ok)setInvalidDraft(false);
  };
  const reviewDraft = (record:RecoveryDraft) => {
    const server=base.current;
    setReview({record,server,keys:restoreFields(server,record).conflicts});setSelected([]);
  };
  const applyReview = () => {
    if(!review||!editor.current)return;
    const candidate=review.current?recoveryDraft(base.current,editor.current.value):review.record;
    const restored=restoreFields(review.server,candidate);
    const localEdits=changedFields(base.current,editor.current.value);
    const next={...restored.value,...(review.current?{}:localEdits)};
    for(const k of restored.conflicts)next[k]=selected.includes(k)?candidate.value[k]:review.server[k];
    base.current=review.server;editor.current=new SnapshotEditor(next,!sameContent(next,base.current));setValue(editor.current.value);
    resolvedArchives.current.push(review.record);setReview(null);setSelected([]);setMessage('恢复选择尚未保存，请确认后保存设置');persist();
  };
  const change = (key: string, value: any) => {
    if(!editor.current||review)return;
    setValue(editor.current.edit(p => {p[key]=value}));persist();setFailed(false);
    setMessage(editor.current.busy?'正在保存提交版本，当前还有未保存修改':'未保存');
  };
  const save = async () => {
    const session=editor.current;if(!session || session.busy || readOnly || review)return;
    setBusy(true);setFailed(false);setMessage('正在保存…');
    let confirmed:any, conflictingServer:any;
    try{
      await session.save(async value => {
        const latest=await request('GET','/training-settings',undefined,token);
        if(latest.__offline)throw Error('缓存不能用于核对设置保存');
        const merge=restoreFields(latest,recoveryDraft(base.current,value));
        if(merge.conflicts.length){conflictingServer=latest;throw Object.assign(new Error('服务器同一字段已变化，请先逐项确认'),{status:409});}
        return confirmed=await request('PUT','/training-settings',changedFields(base.current,value),token);
      },async()=>confirmed=await request('GET','/training-settings',undefined,token),
        (server,submitted)=>sameContent(Object.fromEntries(Object.keys(changedFields(base.current,submitted)).map(k=>[k,server[k]])),changedFields(base.current,submitted)),
        (current,server,submitted)=>({...server,...changedFields(submitted,current)}));
      if(!alive.current || useAuthStore.getState().user?.id!==uid)return;
      base.current=confirmed;setValue(session.value);persist();setMessage(session.dirty?'提交版本已保存，当前还有新修改':'全部已保存');
      const completed=resolvedArchives.current;resolvedArchives.current=[];
      for(const record of completed){if(forgetDraft(draftKey,record,validSettingsDraft))setReviews(v=>v.filter(d=>!sameContent(d,record)));else setStorageWarning('设置已保存，但旧草稿存档仍保留。');}
    }catch(e){if(alive.current){
      if(conflictingServer){const record=recoveryDraft(base.current,session.value);if(!archiveDraft(draftKey,record,validSettingsDraft))protectedDraft.current=record;setReviews(v=>v.some(d=>sameContent(d,record))?v:[...v,record]);setReview({record,server:conflictingServer,keys:restoreFields(conflictingServer,record).conflicts,current:true});setSelected([]);}
      setFailed(true);setMessage(getErrorMessage(e)+(session.uncertain?'；保存结果待核对，草稿已保留':''));
    }}
    finally{if(alive.current)setBusy(false);}
  };
  return (
    <div className="page gym-page">
      <Header title="训练设置" back={() => navigate("/train/plans")} />
      {q.error && <div className="gym-error" role="alert">设置读取失败：{q.error}<button disabled={q.loading || busy} onClick={q.reload}>重试读取设置</button></div>}
      <CachedDataNotice data={q.data} reload={q.reload} busy={q.loading || busy}/>
      {storageWarning && <div className="gym-cache-notice" role="status"><p>{storageWarning}</p>{invalidDraft && <button disabled={busy} onClick={()=>{if(removeDraft(draftKey)){unreadActive.current=false;setInvalidDraft(false);setStorageWarning('');}else setStorageWarning('本机草稿暂时无法清理，仍可编辑并联网保存。');}}>放弃损坏设置草稿</button>}</div>}
      {!!reviews.length && <details className="gym-cache-notice"><summary>保留的设置草稿 · {reviews.length}</summary>{reviews.map((d,i)=><button key={i} className="secondary" disabled={busy} onClick={()=>reviewDraft(d)}>查看设置草稿 {i+1}</button>)}</details>}
      {review && <section className="gym-form" aria-label="设置草稿字段确认"><h3>{review.record.base?'双方修改的字段':'旧格式草稿：选择需要恢复的字段'}</h3><p>默认使用服务器值；只有勾选的字段使用本机值。器械与杠铃片按整个字段处理。</p>
        {review.keys.map(k=><label className="gym-draft-field" key={k}><input type="checkbox" checked={selected.includes(k)} onChange={e=>setSelected(v=>e.target.checked?[...v,k]:v.filter(x=>x!==k))}/><span><b>{settingNames[k]||k}</b><small>服务器：{settingValue(k,review.server[k])}</small><small>本机：{settingValue(k,review.current?editor.current?.value[k]:review.record.value[k])}</small></span></label>)}
        <button className="secondary" disabled={busy} onClick={applyReview}>确认字段选择，保留为未保存草稿</button>
      </section>}
      {message && (
        <p
          role="status"
          className={failed ? "gym-error" : "gym-edit-status"}
        >
          {message}
        </p>
      )}
      {v ? (
        <form
          className="gym-form"
          onSubmit={e => {e.preventDefault();void save();}}
        >
          <div className="gym-two">
            <label>
              显示单位
              <select
                disabled={!!review}
                value={v.unit}
                onChange={(e) => change("unit", e.target.value)}
              >
                <option value="kg">kg 公斤</option>
                <option value="lb">lb 磅</option>
              </select>
            </label>
            <label>
              日程与日历时区
              <input
                disabled={!!review}
                value={v.timeZone}
                onChange={(e) => change("timeZone", e.target.value)}
                list="gym-zones"
              />
              <datalist id="gym-zones">
                {[
                  "Asia/Shanghai",
                  "Asia/Hong_Kong",
                  "Asia/Tokyo",
                  "Europe/London",
                  "America/New_York",
                  "Pacific/Auckland",
                ].map((z) => (
                  <option key={z}>{z}</option>
                ))}
              </datalist>
            </label>
          </div>
          <p className="gym-muted">
            记录统一保存 kg 和 UTC，切换显示不会重写原始精度或 XP。
          </p>
          <fieldset>
            <legend>我拥有的器械</legend>
            <div className="gym-equipment">
              {lib.data?.equipment
                .filter((x: string) => x !== "body weight")
                .map((x: string) => (
                  <label className="gym-checkbox" key={x}>
                    <input
                      type="checkbox"
                      disabled={!!review}
                      checked={v.equipment.includes(x)}
                      onChange={(e) =>
                        change(
                          "equipment",
                          e.target.checked
                            ? [...v.equipment, x]
                            : v.equipment.filter((a: string) => a !== x),
                        )
                      }
                    />
                    {label(x)}
                  </label>
                ))}
            </div>
          </fieldset>
          <label>
            用力程度
            <select
              disabled={!!review}
              value={v.effort}
              onChange={(e) => change("effort", e.target.value)}
            >
              <option value="off">关闭</option>
              <option value="rpe">RPE</option>
              <option value="rir">RIR</option>
            </select>
          </label>
          <button className="primary" disabled={busy || readOnly || !!review}>
            {busy ? "正在保存…" : editor.current?.uncertain ? "核对并重试保存设置" : "保存个人设置"}
          </button>
        </form>
      ) : q.loading ? <p role="status">正在读取设置…</p> : <p className="gym-muted">设置尚未读取成功，请重试；已有设置不会被清空。</p>}
      <InstallApp />
    </div>
  );
}
export default function Schedule() {
  const [from, setFrom] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    navigate = useNavigate();
  const q = useGymQuery(
    "/training-schedule?days=7" + (from ? "&from=" + from : ""),
  );
  const readOnly=q.loading || !!q.error || !q.data || !!q.data.__offline;
  const lock=useRef(false);
  const change = async (entry: any, kind: string, targetDate?: string) => {
    if(readOnly || lock.current)return;lock.current=true;setBusy(true);
    try {
      const old = q.data.exceptions.find(
        (x: any) =>
          x.plan_id === entry.plan.id &&
          x.routine_id === entry.routine.id &&
          x.original_date === entry.date,
      );
      await request("PUT", "/training-schedule", {
        planId: entry.plan.id,
        routineId: entry.routine.id,
        originalDate: entry.date,
        targetDate,
        kind,
        version: old?.version || 0,
      });
      q.reload();
      setError("");
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      lock.current=false;setBusy(false);
    }
  };
  return (
    <div className="page gym-page">
      <Header title="训练日程" back={() => navigate("/train/plans")} />
      <nav className="gym-links">
        <Link to="/train/settings">训练设置</Link>
        <Link to="/train/free">自由训练</Link>
      </nav>
      <p className="gym-muted">
        按 {q.data?.timeZone || "账号时区"}{" "}
        展示。临时调课不更改周计划，已有安排会并列保留。循环仅显示当前轮次。
      </p>
      <label>
        从这一天查看一周
        <input
          type="date"
          value={from || q.data?.today || ""}
          onChange={(e) => setFrom(e.target.value)}
        />
      </label>
      {(q.error || error) && (
        <div className="gym-error">
          {q.error || error}
          <button onClick={q.reload}>重试</button>
        </div>
      )}
      <CachedDataNotice data={q.data} reload={q.reload} busy={q.loading || busy}/>
      {q.loading && <p role="status">正在读取本周安排…</p>}
      {q.data && !q.data.entries.length && (
        <p className="gym-empty">
          这一周没有安排，可在计划编辑器设置每周训练日。
        </p>
      )}
      {q.data?.entries.map((entry: any, i: number) => (
        <article
          className="gym-form"
          key={entry.date + entry.plan.id + entry.routine.id + i}
        >
          <span className="gym-eyebrow">
            {entry.date}
            {entry.movedFrom ? " · 从 " + entry.movedFrom + " 调来" : ""}
            {entry.rotation ? " · 循环当前轮次" : ""}
          </span>
          <h3>{entry.routine.name}</h3>
          <p>
            {entry.plan.name} · {entry.routine.exercises.length} 个动作
          </p>
          <div className="gym-inline-actions">
            <button
              disabled={busy || readOnly}
              className="primary"
              onClick={async () => {
                if(readOnly || lock.current)return;lock.current=true;setBusy(true);
                try {
                  const w = await beginWorkout({
                    planId: entry.plan.id,
                    routineId: entry.routine.id,
                  });
                  navigate("/train/workout/" + w.id);
                } catch (e) {
                  setError(getErrorMessage(e));
                  lock.current=false;setBusy(false);
                }
              }}
            >
              开始这次训练
            </button>
            {!entry.exceptionId && (
              <button
                disabled={busy || readOnly}
                onClick={() => void change(entry, "skip")}
              >
                跳过本次安排
              </button>
            )}
          </div>
          {!entry.exceptionId && !entry.rotation && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void change(
                  entry,
                  "move",
                  String(new FormData(e.currentTarget).get("date")),
                );
              }}
            >
              <label>
                调到
                <input
                  type="date"
                  name="date"
                  required
                  defaultValue={entry.date}
                />
              </label>
              <button disabled={busy || readOnly}>确认单次调课</button>
            </form>
          )}
        </article>
      ))}
      <details className="gym-form">
        <summary>已调整／跳过的安排</summary>
        {q.data?.exceptions
          .filter((x: any) => x.kind !== "restore")
          .map((x: any) => (
            <div className="gym-list-row" key={x.id}>
              <span>
                {x.original_date} →{" "}
                {x.kind === "skip" ? "已跳过" : x.target_date}
              </span>
              <button
                disabled={busy || readOnly}
                onClick={async () => {
                  if(readOnly || lock.current)return;lock.current=true;setBusy(true);
                  try {
                    await request("PUT", "/training-schedule", {
                      planId: x.plan_id,
                      routineId: x.routine_id,
                      originalDate: x.original_date,
                      kind: "restore",
                      version: x.version,
                    });
                    q.reload();
                  } catch (e) {
                    setError(getErrorMessage(e));
                  } finally {
                    lock.current=false;setBusy(false);
                  }
                }}
              >
                恢复原安排
              </button>
            </div>
          ))}
      </details>
    </div>
  );
}
