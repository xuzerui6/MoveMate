import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";
import Dialog from "../../components/Dialog";
import { Header } from "../motion/components/Header";
import { CachedDataNotice } from "./CachedDataNotice";
import { PlanComparison } from "./PlanComparison";
import { recoveryDraft, readRecoveryDraft, archivedDrafts, archiveDraft, forgetDraft, type RecoveryDraft } from "./recoveryDrafts";
import { SnapshotEditor, planSaveConfirmed, sameContent } from "./editingState";
import { writeDraft, removeDraft, validPlanDraft, draftWriteWarning } from "./draftStorage";
import { repUnit } from "./trainingPresentation";
import { WeightInput } from "./WeightInput";
import { ExerciseLibrary } from "./Library";
import { CameraCapability } from "./CameraCapability";
import {ExerciseDemo} from './ExerciseMedia';
import { request, useGymQuery, getErrorMessage, download } from "./api";
const emptySet = () => ({
  kind: "work",
  reps: 10,
  seconds: 0,
  loadKg: 0,
  restSec: 90,
  side: "both",
  superset: "",
});
export default function PlanEditor() {
  const {planId} = useParams(), uid = useAuthStore(s => s.user?.id);
  return <PlanEditorForm key={String(uid)+":"+planId}/>;
}
function PlanEditorForm() {
  const { planId } = useParams(),
    navigate = useNavigate(),
    query = useGymQuery("/training-plans"),
    prefs = useGymQuery("/training-settings"),
    [plan, setPlan] = useState<any>(null),
    [day, setDay] = useState(0),
    [picker, setPicker] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [remove, setRemove] = useState(false),
    [proposal, setProposal] = useState<any>(null);
  const uid = useAuthStore(s => s.user?.id), draftKey = "gym:draft:" + uid + ":" + planId;
  const token=useRef(localStorage.getItem('token')).current;
  const unreadActive=useRef(false), baseline=useRef<any>(null), protectedDraft=useRef<RecoveryDraft|null>(null), restoredArchive=useRef<RecoveryDraft|null>(null);
  const [conflictDrafts,setConflictDrafts]=useState<RecoveryDraft[]>([]);
  const editor = useRef<SnapshotEditor<any> | null>(null), alive = useRef(true), writeLock = useRef(false);
  const [storageWarning, setStorageWarning] = useState(""), [invalidDraft, setInvalidDraft] = useState(false),
    [more, setMore] = useState(false), [serverReview, setServerReview] = useState<any>(null);
  useEffect(() => {alive.current=true; return () => {alive.current=false;};}, []);
  const currentAccount = () => alive.current && useAuthStore.getState().user?.id === uid;
  const initialize = (value: any, dirty = false) => {
    baseline.current=structuredClone(value);editor.current = new SnapshotEditor(value, dirty);setPlan(editor.current.value);setDay(0);setProposal(null);
  };
  useEffect(() => {
    if (editor.current || !query.data) return;
    const p = query.data.items.find((p: any) => p.id === planId);
    if (!p) {setError("计划不存在或无权访问");return;}
    const saved=archivedDrafts(draftKey,validPlanDraft);
    const old=saved.value || [];
    setConflictDrafts(old);
    if(saved.state==='invalid'||saved.state==='unavailable')setStorageWarning("冲突草稿存档暂时无法读取，未清除任何内容。");
    const draft = readRecoveryDraft(draftKey,validPlanDraft);
    if (draft.state === "valid" && draft.value!.value.id === p.id && draft.value!.value.version === p.version) {
      initialize(draft.value!.value, true);baseline.current=draft.value!.base || structuredClone(p);setMessage("已恢复当前账号的未保存草稿");
    } else {
      initialize(p);
      if (draft.state === "valid") {
        const record=draft.value!;
        if(!archiveDraft(draftKey,record,validPlanDraft))protectedDraft.current=record;
        setConflictDrafts(old.some(v=>sameContent(v,record))?old:[...old,record]);
        setStorageWarning("服务器计划已更新，原草稿已单独保留，请查看对照后选择恢复方式。");
      }
      if (draft.state === "invalid") {unreadActive.current=true;setInvalidDraft(true);setStorageWarning("本机草稿损坏或格式不兼容，当前显示服务器版本；原内容保留至明确放弃。");}
      if (draft.state === "unavailable") {unreadActive.current=true;setStorageWarning("本机草稿无法读取，当前编辑仅保留在内存；不会覆盖无法读取的原稿。");}
    }
  }, [query.data, planId]);
  const persist = (dirty: boolean) => {
    if(unreadActive.current){
      const original=readRecoveryDraft(draftKey,validPlanDraft);
      if(original.state==='unavailable'||original.state==='invalid'){setStorageWarning("原草稿仍无法读取，已保护原内容；新编辑仅在内存中，请勿刷新。");return;}
      if(original.value)protectedDraft.current=original.value;
      unreadActive.current=false;
    }
    if(protectedDraft.current){
      if(!archiveDraft(draftKey,protectedDraft.current,validPlanDraft)) {setStorageWarning("原草稿尚未能单独备份，已保护原稿不被覆盖；新编辑仅在内存中，请勿刷新或关闭。");return;}
      protectedDraft.current=null;
    }
    const ok = dirty ? writeDraft(draftKey, recoveryDraft(baseline.current,editor.current!.value)) : removeDraft(draftKey);
    setStorageWarning(ok ? "" : dirty ? draftWriteWarning : "服务器已保存，但本机草稿清理失败；请勿把旧草稿当作最新状态。");
    if (ok) setInvalidDraft(false);
  };
  const releaseArchive = (record:RecoveryDraft) => {
    if(forgetDraft(draftKey,record,validPlanDraft))setConflictDrafts(v=>v.filter(x=>!sameContent(x,record)));
    else setStorageWarning("服务器状态已确认，但冲突草稿暂时无法清理，已继续保留。");
  };
  const preserveCurrent = (replacement:any) => {
    if(!editor.current?.dirty || sameContent(editor.current.value,replacement))return true;
    const record=recoveryDraft(baseline.current,editor.current.value);
    if(!archiveDraft(draftKey,record,validPlanDraft)){
      setStorageWarning("当前编辑尚未能单独备份，已保留在内存；请先保存当前编辑，再恢复另一份草稿。");return false;
    }
    setConflictDrafts(v=>v.some(d=>sameContent(d,record))?v:[...v,record]);return true;
  };
  const readServer = async () => {
    const data = await request("GET", "/training-plans", undefined, token);
    if (data.__offline) throw Error("当前只能读取缓存，请联网核对服务器版本");
    const value = data.items.find((p: any) => p.id === planId);
    if (!value) throw Error("计划不存在或无权访问");
    return value;
  };
  const inspectServer = async (record?:RecoveryDraft) => {
    if (writeLock.current) return;
    writeLock.current=true;setBusy(true);
    try {const value=await readServer();if(currentAccount()){setServerReview({server:value,local:record?.value || structuredClone(editor.current!.value),record});setMore(false);}}
    catch(e){if(currentAccount())setError(getErrorMessage(e));}
    finally{writeLock.current=false;if(currentAccount())setBusy(false);}
  };
  const ids =
    plan?.routines
      .flatMap((r: any) => r.exercises.map((e: any) => e.exerciseId))
      .join(",") || "";
  const archivedIds=conflictDrafts.flatMap(d=>d.value.routines.flatMap((r:any)=>r.exercises.map((e:any)=>e.exerciseId))).join(',');
  const reviewedIds=serverReview?.server.routines.flatMap((r:any)=>r.exercises.map((e:any)=>e.exerciseId)).join(',') || '';
  const names = useGymQuery(
    "/exercises?limit=500&ids=" + encodeURIComponent([ids,archivedIds,reviewedIds].filter(Boolean).join(',')),
  );
  const map = Object.fromEntries(
    (names.data?.items || []).map((e: any) => [e.id, e]),
  );
  const readOnly = query.loading || !!query.error || !query.data || !!query.data.__offline;
  const edit = (change: (p: any) => void) => {
    if (!editor.current) return;
    setPlan(editor.current.edit(change));persist(true);
    setMessage(editor.current.busy ? "正在保存提交版本，当前还有未保存修改" : "未保存");
  };
  const save = async (next?:any, reviewed=false) => {
    if (writeLock.current || !editor.current || (readOnly && !reviewed)) return;
    const session = editor.current;
    if (next && next !== session.value) {
      if (session.dirty || session.uncertain) {setError("请先保存或核对当前编辑，再重新获取进阶建议。");return;}
      session.edit(p => Object.assign(p, structuredClone(next)));setPlan(session.value);persist(true);
    }
    writeLock.current=true;setBusy(true);setError("");setMessage("正在保存…");
    let confirmed:any;
    try {
      await session.save(async value => confirmed=await request("PUT", "/training-plans/" + planId, value, token), async()=>confirmed=await readServer(),
        planSaveConfirmed, (local, server) => ({...local,id:server.id,version:server.version}),
        (server, submitted) => server.version !== submitted.version);
      if (!currentAccount()) return;
      baseline.current=confirmed;setPlan(session.value);persist(session.dirty);
      if(restoredArchive.current){releaseArchive(restoredArchive.current);restoredArchive.current=null;}
      setMessage(session.dirty ? "提交版本已保存，当前还有新修改" : "全部已保存");setProposal(null);return true;
    } catch (e) {
      if(currentAccount()){setError(getErrorMessage(e));setMessage(session.uncertain ? "保存结果待核对，本机编辑已保留" : "保存失败，本机编辑已保留");}
    } finally {writeLock.current=false;if(currentAccount())setBusy(false);}
  };
  const sharePlan = () => {
            const copy = structuredClone(plan);
            copy.routines.forEach((r: any) =>
              r.exercises.forEach((e: any) =>
                e.sets.forEach((s: any) => (s.loadKg = 0)),
              ),
            );
            download(
              plan.name + ".json",
              JSON.stringify(
                {
                  format: "movemate-plan",
                  plan: copy,
                  customExercises: Object.values(map).filter((e: any) =>
                    e.id.startsWith("user:"),
                  ),
                },
                null,
                2,
              ),
            );
  };
  if (!plan)
    return (
      <div className="page gym-page">
        <Header title="编辑计划" back={() => navigate("/train/plans")} />
        {error || query.error ? (
          <div className="gym-error">
            {error || query.error}
            <button
              onClick={() => {
                query.reload();
                setError("");
              }}
            >
              重试
            </button>
          </div>
        ) : (
          <p>正在读取计划…</p>
        )}
      </div>
    );
  const routine = plan.routines[day];
  return (
    <div className="page gym-page gym-editor">
      <Header title="编辑训练计划" back={() => navigate("/train/plans")} />
      <p className="gym-muted">
        计划修改影响下次训练；正在进行的训练保留开始时的安排。
      </p>
      <CachedDataNotice data={query.data} reload={query.reload} busy={query.loading || busy}/>
      {storageWarning && <div className="gym-cache-notice" role="status"><p>{storageWarning}</p>{invalidDraft && <button disabled={busy} onClick={() => {if(removeDraft(draftKey)){unreadActive.current=false;setInvalidDraft(false);setStorageWarning("");}else setStorageWarning("本机草稿暂时无法清理，仍可继续编辑并联网保存。");}}>放弃损坏草稿</button>}</div>}
      {!!conflictDrafts.length && <section className="gym-cache-notice" aria-label="保留的冲突草稿"><h3>保留的冲突草稿</h3>{conflictDrafts.map((d,i)=><div key={i}><span>{d.value.name} · 原版本 {d.value.version}</span><button className="secondary" disabled={busy} onClick={()=>void inspectServer(d)}>查看草稿对照 {i+1}</button></div>)}</section>}
      <p className="gym-edit-status" role="status">{message || "当前为服务器版本"}</p>
      {error && (
        <div className="gym-error" role="alert">
          {error}
          <button disabled={busy} onClick={() => void inspectServer()}
          >
            核对服务器版本（保留草稿）
          </button>
        </div>
      )}

      <div className="gym-form">
        <label>
          计划名称
          <input
            value={plan.name}
            maxLength={80}
            onChange={(e) => edit((p) => (p.name = e.target.value))}
          />
        </label>
        <div className="gym-two">
          <label>
            安排方式
            <select
              value={plan.mode}
              onChange={(e) => edit((p) => (p.mode = e.target.value))}
            >
              <option value="weekly">每周排课</option>
              <option value="rotation">A / B / C 循环</option>
            </select>
          </label>
          {plan.mode === "rotation" && (
            <label>
              下一次训练
              <select
                value={plan.rotationCursor}
                onChange={(e) =>
                  edit((p) => (p.rotationCursor = Number(e.target.value)))
                }
              >
                {plan.routines.map((r: any, i: number) => (
                  <option key={r.id} value={i}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>
      <div className="gym-day-tabs" role="tablist" aria-label="训练日">
        {plan.routines.map((r: any, i: number) => (
          <button
            key={r.id}
            role="tab"
            aria-selected={i === day}
            onClick={() => setDay(i)}
          >
            {r.name}
          </button>
        ))}
        <button
          onClick={() => {
            edit((p) =>
              p.routines.push({
                id: crypto.randomUUID(),
                name: "新训练日",
                weekdays: [],
                exercises: [],
              }),
            );
            setDay(plan.routines.length);
          }}
          disabled={plan.routines.length >= 14}
        >
          ＋训练日
        </button>
      </div>
      <section className="gym-form">
        <label>
          训练日名称
          <input
            value={routine.name}
            onChange={(e) =>
              edit((p) => (p.routines[day].name = e.target.value))
            }
          />
        </label>
        {plan.mode === "weekly" && (
          <fieldset className="gym-weekdays">
            <legend>安排在哪些天</legend>
            {["日", "一", "二", "三", "四", "五", "六"].map((d, i) => (
              <label key={i}>
                <input
                  type="checkbox"
                  checked={routine.weekdays.includes(i)}
                  onChange={(e) =>
                    edit((p) => {
                      const r = p.routines[day];
                      r.weekdays = e.target.checked
                        ? [...r.weekdays, i]
                        : r.weekdays.filter((v: number) => v !== i);
                    })
                  }
                />
                周{d}
              </label>
            ))}
          </fieldset>
        )}
        {routine.exercises.map((entry: any, index: number) => (
          <article className="gym-edit-exercise" key={index + entry.exerciseId}>
            <div className="gym-section-title">
              <h3>{map[entry.exerciseId]?.nameZh || entry.exerciseId}</h3>
              <div className="gym-small-actions">
                <button
                  aria-label="上移动作"
                  disabled={!index}
                  onClick={() =>
                    edit((p) => {
                      const a = p.routines[day].exercises;
                      [a[index - 1], a[index]] = [a[index], a[index - 1]];
                    })
                  }
                >
                  上移
                </button>
                <button
                  aria-label="下移动作"
                  disabled={index === routine.exercises.length - 1}
                  onClick={() =>
                    edit((p) => {
                      const a = p.routines[day].exercises;
                      [a[index + 1], a[index]] = [a[index], a[index + 1]];
                    })
                  }
                >
                  下移
                </button>
                <button
                  onClick={() =>
                    edit((p) => p.routines[day].exercises.splice(index, 1))
                  }
                >
                  移除动作
                </button>
              </div>
            </div>
            <CameraCapability exercise={map[entry.exerciseId]} />
            <ExerciseDemo exercise={map[entry.exerciseId]}/>
            <details>
              <summary>此动作的进阶覆盖（不选则沿用计划）</summary>
              <label>
                规则
                <select
                  value={entry.progression?.mode ?? "inherit"}
                  onChange={(e) =>
                    edit((p) => {
                      const entry = p.routines[day].exercises[index];
                      if (e.target.value === "inherit")
                        delete entry.progression;
                      else
                        entry.progression = {
                          ...p.progression,
                          mode: e.target.value,
                        };
                    })
                  }
                >
                  <option value="inherit">沿用计划</option>
                  <option value="off">关闭</option>
                  <option value="linear">线性加重</option>
                  <option value="double">次数再重量</option>
                  <option value="triple">次数、组数再重量</option>
                  <option value="time">增加有效秒数</option>
                </select>
              </label>
              {entry.progression &&
                [
                  "incrementKg",
                  "minReps",
                  "maxReps",
                  "maxSets",
                  "incrementSeconds",
                ].map((k) => (
                  <label key={k}>
                    {
                      {
                        incrementKg: "增加 kg",
                        minReps: "最低次数",
                        maxReps: "次数上限",
                        maxSets: "组数上限",
                        incrementSeconds: "增加秒数",
                      }[k]
                    }
                    <input
                      type="number"
                      min={k === "incrementKg" ? 0.25 : 1}
                      max={k === "incrementKg" || k === "maxSets" ? 20 : 500}
                      step={k === "incrementKg" ? 0.25 : 1}
                      value={
                        entry.progression[k] ??
                        (k === "incrementSeconds" ? 5 : 1)
                      }
                      onChange={(e) =>
                        edit(
                          (p) =>
                            (p.routines[day].exercises[index].progression[k] =
                              Number(e.target.value)),
                        )
                      }
                    />
                  </label>
                ))}
            </details>
            {entry.sets.map((s: any, i: number) => (
              <div className="gym-set-editor" key={i}>
                <b>第{i + 1}组</b>
                <label>
                  组类型
                  <select
                    value={s.kind}
                    onChange={(e) =>
                      edit(
                        (p) =>
                          (p.routines[day].exercises[index].sets[i].kind =
                            e.target.value),
                      )
                    }
                  >
                    {Object.entries({
                      warmup: "热身组",
                      work: "正式组",
                      drop: "递减组",
                      rest_pause: "休息暂停组",
                    }).map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                {[
                  ["reps", s.seconds > 0 ? "次数目标（计时组不使用）" : repUnit(map[entry.exerciseId]) === "对" ? "目标配对数（对）" : "目标次数（次）", 1, 500],

                  ["seconds", "计时目标秒（0为次数）", 0, 7200],
                  ["restSec", "组后休息秒", 0, 900],
                ].map(([key, title, min, max]) => (
                  <label key={key}>
                    {title}
                    <input
                      type="number"
                      min={min}
                      max={max}
                      step={key === "loadKg" ? 0.25 : 1}
                      value={s[key]}
                      onChange={(e) =>
                        edit(
                          (p) =>
                            (p.routines[day].exercises[index].sets[i][key] =
                              Number(e.target.value)),
                        )
                      }
                    />
                  </label>
                ))}
                <WeightInput
                  kg={s.loadKg}
                  unit={prefs.data?.unit || "kg"}
                  onChange={(kg) =>
                    edit(
                      (p) =>
                        (p.routines[day].exercises[index].sets[i].loadKg = kg),
                    )
                  }
                />
                <label>
                  左右侧
                  <select
                    value={s.side}
                    onChange={(e) =>
                      edit(
                        (p) =>
                          (p.routines[day].exercises[index].sets[i].side =
                            e.target.value),
                      )
                    }
                  >
                    <option value="both">双侧合计</option>
                    <option value="each">每侧次数</option>
                    <option value="left">仅左侧</option>
                    <option value="right">仅右侧</option>
                  </select>
                </label>
                <label>
                  超级组编号（可空）
                  <input
                    value={s.superset}
                    maxLength={20}
                    placeholder="如 A，同编号交替"
                    onChange={(e) =>
                      edit(
                        (p) =>
                          (p.routines[day].exercises[index].sets[i].superset =
                            e.target.value),
                      )
                    }
                  />
                </label>
                <button
                  disabled={entry.sets.length < 2}
                  onClick={() =>
                    edit((p) =>
                      p.routines[day].exercises[index].sets.splice(i, 1),
                    )
                  }
                >
                  移除此组
                </button>
              </div>
            ))}
            <button
              className="secondary"
              disabled={entry.sets.length >= 20}
              onClick={() =>
                edit((p) =>
                  p.routines[day].exercises[index].sets.push({
                    ...entry.sets[entry.sets.length - 1],
                  }),
                )
              }
            >
              添加一组
            </button>
          </article>
        ))}
        <button className="secondary" onClick={() => setPicker(true)}>
          从动作库添加动作
        </button>
        <button
          className="text-btn"
          disabled={plan.routines.length < 2}
          onClick={() => {
            edit((p) => p.routines.splice(day, 1));
            setDay(0);
          }}
        >
          移除这个训练日
        </button>
      </section>
      <details className="gym-form gym-progression">
        <summary>进阶规则（默认关闭）</summary>
        <label>
          规则
          <select
            value={plan.progression.mode}
            onChange={(e) => edit((p) => (p.progression.mode = e.target.value))}
          >
            <option value="off">关闭</option>
            <option value="time">计时：完成后增加有效秒数</option>
            <option value="linear">线性：完成后增加负重</option>
            <option value="double">双重：先加次数，再加负重</option>
            <option value="triple">三级：次数、组数、负重</option>
          </select>
        </label>
        <div className="gym-two">
          {[
            ["incrementKg", "每次加重 kg", 0.25, 20],
            ["minReps", "加重后次数", 1, 500],
            ["maxReps", "次数上限", 1, 500],
            ["maxSets", "组数上限", 1, 20],
            ["incrementSeconds", "计时进阶增加秒数", 1, 300],
          ].map(([key, title, min, max]) => (
            <label key={key}>
              {title}
              <input
                type="number"
                min={min}
                max={max}
                step={key === "incrementKg" ? 0.25 : 1}
                value={plan.progression[key]}
                onChange={(e) =>
                  edit((p) => (p.progression[key] = Number(e.target.value)))
                }
              />
            </label>
          ))}
        </div>
        <button
          className="secondary"
          disabled={busy || readOnly || !!editor.current?.dirty}
          onClick={async () => {
            setError("");
            try {
              const result = await request(
                "GET",
                "/training-plans/" + planId + "/progression",
              );
              setProposal(result);
            } catch (e) {
              setError(getErrorMessage(e));
            }
          }}
        >
          根据已保存计划查看进阶建议
        </button>
        {proposal && (
          <div>
            <p>
              {proposal.suggestions.length
                ? `${proposal.suggestions.length}项建议，确认后才会修改计划。`
                : proposal.reason || "还没有达到进阶条件。"}
            </p>
            {proposal.suggestions.map((s: any, i: number) => (
              <p key={i}>
                {map[s.exerciseId]?.nameZh || s.exerciseId}：{s.before.loadKg}→
                {s.after.loadKg}kg，{s.before.reps}→{s.after.reps}次，
                {s.before.seconds || 0}→{s.after.seconds || 0}秒 · {s.reason}
              </p>
            ))}
            {!!proposal.suggestions.length && (
              <button
                className="primary"
                onClick={() =>
                  void save({ ...proposal.plan, version: plan.version })
                }
                disabled={busy || readOnly || !!editor.current?.dirty}
              >
                确认应用并保存建议
              </button>
            )}
          </div>
        )}
      </details>
      <div className="gym-save-bar gym-editor-save-bar"><button className="primary" disabled={busy || readOnly} onClick={() => void save()}>{busy ? "正在保存…" : editor.current?.uncertain ? "核对并重试保存" : "保存计划"}</button><button className="secondary gym-editor-more-toggle" disabled={busy} onClick={() => setMore(true)}>更多</button><div className="gym-editor-secondary-actions">
        <button
          className="text-btn"
          disabled={busy} onClick={() => void inspectServer()}
        >
          放弃本机草稿，读取服务器
        </button>
        <button
          className="secondary"
          onClick={sharePlan}
        >
          分享计划文件
        </button>
        <button className="secondary" onClick={() => window.print()}>
          打印／存为 PDF
        </button>
        <button className="text-btn" disabled={busy || readOnly} onClick={() => setRemove(true)}>
          删除计划
        </button>
      </div></div>
      {more && <Dialog title="计划操作" onClose={() => setMore(false)}><div className="gym-page gym-plan-menu"><button disabled={busy} onClick={() => void inspectServer()}>放弃本机草稿，读取服务器</button><button disabled={busy} onClick={() => {sharePlan();setMore(false);}}>分享计划文件</button><button disabled={busy} onClick={() => {setMore(false);setTimeout(() => window.print(),0);}}>打印／存为 PDF</button><button disabled={busy || readOnly} onClick={() => {setMore(false);setRemove(true);}}>删除计划</button></div></Dialog>}
      {serverReview && <Dialog title="核对服务器版本" dismissible={!busy} onClose={() => setServerReview(null)}>
        <p>两份内容均已保留。只有明确确认后才会替换；保存仍检查服务器版本。</p>
        <PlanComparison local={serverReview.local} server={serverReview.server} names={map}/>
        <div className="dialog-actions"><button className="btn btn--secondary" disabled={busy} onClick={() => setServerReview(null)}>保留本机编辑</button>
        <button className="btn btn--secondary" disabled={busy} onClick={() => {const review=serverReview;if(review.record && !preserveCurrent(review.local))return;initialize(review.server);persist(false);if(review.record)releaseArchive(review.record);setServerReview(null);setError("");setMessage("已读取服务器版本");query.reload();}}>使用服务器版本，放弃这份草稿</button>
        <button className="btn btn--primary" disabled={busy} onClick={async()=>{
          const review=serverReview;
          if(!preserveCurrent(review.local))return;
          // Preserve the chosen original before changing the active editor.
          if(review.record && !archiveDraft(draftKey,review.record,validPlanDraft))protectedDraft.current=review.record;
          initialize({...structuredClone(review.local),id:review.server.id,version:review.server.version},true);
          baseline.current=review.server;restoredArchive.current=review.record || null;persist(true);setServerReview(null);
          await save(undefined,true);
        }}>确认将本机草稿保存为新版本</button></div>
      </Dialog>}
      <div className="gym-print-document">
        <h1>{plan.name}</h1>
        {plan.routines.map((r: any) => (
          <section key={r.id}>
            <h2>{r.name}</h2>
            {r.exercises.map((e: any, i: number) => (
              <div key={i}>
                <h3>{map[e.exerciseId]?.nameZh || e.exerciseId}</h3>
                {e.sets.map((s: any, j: number) => (
                  <p key={j}>
                    第 {j + 1} 组 · {s.kind} ·{" "}
                    {s.seconds ? s.seconds + " 秒" : s.reps + " " + repUnit(map[e.exerciseId])} ·{" "}
                    {s.loadKg} kg · 休息 {s.restSec} 秒{" "}
                    {s.superset ? "· 超级组 " + s.superset : ""}
                  </p>
                ))}
              </div>
            ))}
          </section>
        ))}
      </div>
      {picker && (
        <Dialog title="添加动作" onClose={() => setPicker(false)}>
          <div className="gym-page">
            <ExerciseLibrary
              onPick={(ex) => {
                edit((p) =>
                  p.routines[day].exercises.push({
                    exerciseId: ex.id,
                    sets: [emptySet(), emptySet(), emptySet()],
                  }),
                );
                setPicker(false);
              }}
            />
          </div>
        </Dialog>
      )}
      {remove && (
        <Dialog title="删除这个计划？" dismissible={!busy} onClose={() => setRemove(false)}>
          <p>仅删除计划，已完成训练与历史记录保留。</p>
          <button
            className="primary"
            disabled={busy || readOnly}
            onClick={async () => {
              if(writeLock.current) return;writeLock.current=true;setBusy(true);
              try {
                await request("DELETE", "/training-plans/" + planId, undefined, token);
                navigate("/train/plans");
              } catch (e) {
                setError(getErrorMessage(e));
                setRemove(false);
              } finally {writeLock.current=false;if(currentAccount())setBusy(false);}
            }}
          >
            确认删除
          </button>
        </Dialog>
      )}
    </div>
  );
}
