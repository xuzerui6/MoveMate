import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";
import { Header } from "../motion/components/Header";
import { PoseCanvas } from "../motion/components/PoseCanvas";
import { usePose } from "../motion/hooks/usePose";
import { usePlanRecognition, type PlanRecognitionType } from "./usePlanRecognition";
import { PlanRecognitionStatus } from "./PlanRecognitionStatus";
import { isNewPlanProfile } from "./planRecognition";
import { exerciseInfo } from "../motion/lib/exercises";
import { useXiaozhiCoach } from "../motion/hooks/useXiaozhiCoach";
import { useSessionClock } from "../motion/hooks/useSessionClock";
import { useStore } from "../motion/lib/store";
import type { WorkoutContext } from "../motion/types";
import { request, getErrorMessage, formatTime } from "./api";
import {
  WorkoutSync,
  restoredSetMetrics,
  reconcileNetworkRecovery,
} from "./workoutSync";
import Dialog from "../../components/Dialog";
import { WeightInput } from "./WeightInput";
import { displayWeight } from "./trainingMath";
import { PlateCalculator } from "./AnalysisExtras";
import {
  useWorkoutPreferences,
  WorkoutEditor,
  SaveAsPlan,
} from "./WorkoutOptions";
const stamp = (w: any) => ({
  ...w,
  session: w.session ? { ...w.session, receivedAt: Date.now() } : null,
});
export default function PlanWorkout() {
  const { workoutId } = useParams(),
    navigate = useNavigate(),
    uid = useAuthStore((s) => s.user?.id),
    store = useStore();
  const token = useRef(localStorage.getItem("token")).current,
    key = `gym:pending:${uid}:${workoutId}`,
    networkKey = key + ":network";
  const markNetworkLoss = () => {
    if (
      useAuthStore.getState().user?.id === uid &&
      localStorage.getItem("token") === token
    )
      localStorage.setItem(
        networkKey,
        String(latest.current?.version || sync.current?.row?.version || 0),
      );
  };
  const [row, setRow] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [blocked, setBlocked] = useState(false),
    [offline, setOffline] = useState(!navigator.onLine),
    [effort, setEffort] = useState<number | null>(null),
    [notes, setNotes] = useState(""),
    [manualReps, setManualReps] = useState(0),
    [weight, setWeight] = useState(0),
    [voiceOn, setVoiceOn] = useState(false),
    [consent, setConsent] = useState(false),
    [finishDialog, setFinishDialog] = useState(false),
    [expanded, setExpanded] = useState(false),
    [fit, setFit] = useState<"contain" | "cover">("contain");
  const alive = useRef(true),
    sync = useRef<WorkoutSync | null>(null),
    latest = useRef<any>(null),
    loadedId = useRef(""),
    lastSynced = useRef(0),
    controlLock = useRef(false);
  const [tick, setTick] = useState(Date.now());
  const [recoveryKey, setRecoveryKey] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  const accept = (raw: any) => {
    const next = stamp(raw);
    latest.current = next;
    if (alive.current) setRow(next);
    else if (next.phase === "working" && sync.current) {
      // A start may commit after navigation. Close that same account's interval.
      void sync.current
        .run("pause", { reps: next.sets[next.cursor]?.reps || 0 })
        .catch(() => {});
    }
    return next;
  };
  const load = async () => {
    setError("");
    try {
      const raw = await request(
        "GET",
        "/workout-sessions/" + workoutId,
        undefined,
        token,
      );
      if (!alive.current) return;
      accept(raw);
      sync.current = new WorkoutSync(
        raw,
        (b) =>
          request(
            "POST",
            "/workout-sessions/" + workoutId + "/actions",
            b,
            token,
          ),
        async () => {
          const pending = JSON.parse(localStorage.getItem(key) || "null");
          const force =
            !!localStorage.getItem(networkKey) || !!pending?.offline;
          const next = await request(
            "GET",
            "/workout-sessions/" +
              workoutId +
              (force
                ? "?recover=offline&version=" +
                  (pending?.version ||
                    Number(localStorage.getItem(networkKey)) ||
                    raw.version) +
                  (pending?.operationId
                    ? "&operationId=" + encodeURIComponent(pending.operationId)
                    : "")
                : ""),
            undefined,
            token,
          );
          if (next.__offline)
            throw new Error("当前只能读取缓存，请联网后再核对服务端");
          if (force) {
            const replay = reconcileNetworkRecovery(pending, next);
            if (replay) localStorage.setItem(key, JSON.stringify(replay));
            else localStorage.removeItem(key);
          }
          if (force || !pending) localStorage.removeItem(networkKey);
          return next;
        },
        {
          get: () => JSON.parse(localStorage.getItem(key) || "null"),
          set: (v) => {
            v
              ? localStorage.setItem(key, JSON.stringify(v))
              : localStorage.removeItem(key);
            if (alive.current && !v) setBlocked(false);
          },
        },
        accept,
      );
      setBlocked(
        !!localStorage.getItem(key) ||
          !!localStorage.getItem(networkKey) ||
          !!raw.__offline,
      );
      if (
        raw.phase === "working" &&
        raw.sets[raw.cursor]?.inputMode === "camera" &&
        !localStorage.getItem(key) &&
        !raw.__offline &&
        !localStorage.getItem(networkKey)
      ) {
        await sync.current.run("pause", { reps: raw.sets[raw.cursor].reps });
      }
    } catch (e) {
      if (alive.current) {
        setError(getErrorMessage(e));
        setBlocked(!!localStorage.getItem(key));
      }
    }
  };
  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
    };
  }, [workoutId]);
  const current = row?.sets[row.cursor],
    camera = !!current && current.inputMode === "camera",
    working = row?.phase === "working",
    finished = row?.phase === "finished";
  const pose = usePose(camera && working && !busy && !blocked && !offline),
    seconds = useSessionClock(row?.session, busy || blocked || offline);
  const type: PlanRecognitionType = current?.exercise.planCamera?.profile || current?.exercise.cameraType || "squat";
  const capability = current?.exercise.planCamera;
  const canRecognize = !!(capability || current?.exercise.cameraType) && !current?.targetSeconds && current?.side === "both";
  const restored = useMemo(
    () => restoredSetMetrics(current),
    [current?.id, recoveryKey],
  );
  const { metrics, diagnostics } = usePlanRecognition(
    type,
    pose.landmarks,
    camera && pose.status === "ready",
    !working || busy || blocked || offline,
    pose.videoRef.current?.videoWidth && pose.videoRef.current.videoHeight
      ? pose.videoRef.current.videoWidth / pose.videoRef.current.videoHeight
      : 1,
    restored,
    current?.targetReps || 20,
    (current?.id || "none") + ":" + recoveryKey,
    pose.worldLandmarks,
  );
  const restSeconds =
    Math.max(0, Math.ceil((Date.parse(row?.restUntil || "") - tick) / 1000)) ||
    0;
  const options = useWorkoutPreferences(!!row && !finished, restSeconds);
  const snapshot = useRef<any>({});
  snapshot.current = camera
    ? { reps: metrics.reps, loadKg: weight, score: metrics.scoreAccumulator }
    : { reps: current?.targetSeconds ? 0 : manualReps, loadKg: weight };
  snapshot.current = {
    ...snapshot.current,
    effort:
      options.prefs?.effort && options.prefs.effort !== "off" && effort !== null
        ? { kind: options.prefs.effort, value: effort }
        : null,
    notes,
  };
  useEffect(() => {
    if (!current || loadedId.current === current.id + ":" + recoveryKey) return;
    loadedId.current = current.id + ":" + recoveryKey;
    const suggestion = row.previous?.[current.exercise.id];
    setManualReps(
      current.reps ||
        (current.targetSeconds ? 0 : (suggestion?.reps ?? current.targetReps)),
    );
    setWeight(
      current.status === "pending"
        ? (suggestion?.loadKg ?? current.loadKg)
        : current.loadKg,
    );
    setEffort(current.effort?.value ?? null);
    setNotes(current.notes || "");
    lastSynced.current = current.reps;
  }, [current?.id, recoveryKey]);
  const run = async (action: string, values: any = {}, control = true) => {
    if (!sync.current || (control && controlLock.current)) return;
    if (!navigator.onLine)
      throw new Error("当前离线，已停止本地识别；联网后先恢复同步");
    if (control) {
      controlLock.current = true;
      setBusy(true);
    }
    setError("");
    try {
      return await sync.current.run(action, values);
    } catch (e: any) {
      if (
        (!e?.response?.status || e.response.status >= 500) &&
        localStorage.getItem(key)
      )
        markNetworkLoss();
      if (alive.current) {
        setError(getErrorMessage(e));
        setBlocked(e?.response?.status === 409 || !!localStorage.getItem(key));
      }
      throw e;
    } finally {
      if (control) {
        controlLock.current = false;
        if (alive.current) setBusy(false);
      }
    }
  };
  const act = (action: string, values: any = {}) =>
    void run(action, values).catch(() => {});
  const start = async (mode: "manual" | "camera", resume = false) => {
    if (controlLock.current) return;
    controlLock.current = true;
    setBusy(true);
    setError("");
    try {
      if (mode === "camera" && pose.status !== "ready" && !(await pose.start()))
        throw new Error(
          pose.errorReason.current || "摄像头或模型未就绪。请允许摄像头后重试，或改为手动记录。",
        );
      if (!alive.current) return;
      await sync.current!.run(
        resume ? "resume" : "start",
        resume ? {} : { inputMode: mode },
      );
    } catch (e: any) {
      if (
        (!e?.response?.status || e.response.status >= 500) &&
        localStorage.getItem(key)
      )
        markNetworkLoss();
      pose.stop();
      setError(getErrorMessage(e));
      setBlocked(e?.response?.status === 409 || !!localStorage.getItem(key));
    } finally {
      controlLock.current = false;
      setBusy(false);
    }
  };
  const recover = async () => {
    if (!sync.current) return;
    if (!navigator.onLine) {
      setError("请先联网，再读取服务端状态");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const latest = await sync.current.recover();
      if (
        latest.phase === "working" &&
        latest.sets[latest.cursor]?.inputMode === "camera" &&
        pose.status !== "ready"
      )
        await sync.current.run("pause", {
          reps: latest.sets[latest.cursor].reps,
        });
      setRecoveryKey((n) => n + 1);
      setBlocked(false);
    } catch (e) {
      setError(getErrorMessage(e));
      setBlocked(true);
    } finally {
      setBusy(false);
    }
  };
  // Count checkpoints share the same queue as controls; a completed set is a hard barrier.
  useEffect(() => {
    if (
      !camera ||
      !working ||
      busy ||
      blocked ||
      metrics.reps <= lastSynced.current
    )
      return;
    const id = setTimeout(() => {
      lastSynced.current = metrics.reps;
      void run("progress", snapshot.current, false).catch(() => {});
    }, 400);
    return () => clearTimeout(id);
  }, [camera, working, busy, blocked, metrics.reps]);
  useEffect(() => {
    if (!working || busy || blocked || offline) return;
    const timer = setInterval(() => {
      void run("heartbeat", {}, false).catch(() => {});
    }, 15000);
    return () => clearInterval(timer);
  }, [working, busy, blocked, offline]);
  useEffect(() => {
    const off = () => {
      markNetworkLoss();
      setOffline(true);
      setBlocked(true);
      setVoiceOn(false);
      if (latest.current?.phase === "working") {
        const pending = JSON.parse(localStorage.getItem(key) || "null");
        if (!pending)
          localStorage.setItem(
            key,
            JSON.stringify({
              ...snapshot.current,
              action: "pause",
              offline: true,
              operationId: crypto.randomUUID(),
              version: latest.current.version,
              setId: latest.current.sets[latest.current.cursor]?.id,
            }),
          );
      }
    };
    const on = () => {
      setOffline(false);
      setBlocked(true);
      setError("网络已恢复，请先读取服务端并恢复同步；离线时段不补计 XP");
    };
    window.addEventListener("offline", off);
    window.addEventListener("online", on);
    return () => {
      window.removeEventListener("offline", off);
      window.removeEventListener("online", on);
    };
  }, [key]);
  const automatic = useRef("");
  useEffect(() => {
    if (
      camera &&
      working &&
      !busy &&
      !blocked &&
      metrics.reps >= current?.targetReps &&
      automatic.current !== current.id
    ) {
      automatic.current = current.id;
      act("complete", snapshot.current);
    }
  }, [camera, working, busy, blocked, metrics.reps, current?.id]);
  useEffect(() => {
    if (camera && working && pose.status === "error" && !busy) {
      void run("pause", snapshot.current).catch(() => {});
    }
  }, [pose.status]);
  const parentRecord = store.sessions.find((s) => s.id === row?.session?.id);
  useEffect(() => {
    if (
      parentRecord?.status === "finished" &&
      (!finished || (parentRecord.settled && !row?.session?.settled)) &&
      row?.session?.gameId
    ) {
      void request("GET", "/workout-sessions/" + workoutId, undefined, token)
        .then((w) => {
          if (!alive.current) return;
          accept(w);
          if (sync.current) sync.current.row = w;
        })
        .catch((e) => setError(getErrorMessage(e)));
    }
  }, [
    parentRecord?.status,
    parentRecord?.settled,
    finished,
    row?.session?.settled,
  ]);
  const finishRef = useRef(false);
  useEffect(() => {
    if (!finished || finishRef.current) return;
    finishRef.current = true;
    setVoiceOn(false);
    pose.stop();
    void store.refresh();
  }, [finished]);
  const flush = () => {
    const w = latest.current;
    if (!w || w.phase !== "working" || localStorage.getItem(key)) return;
    const body = {
      ...snapshot.current,
      action: "pause",
      operationId: crypto.randomUUID(),
      version: w.version,
      setId: w.sets[w.cursor]?.id,
    };
    localStorage.setItem(key, JSON.stringify(body));
    void fetch("/api/v1/workout-sessions/" + workoutId + "/actions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify(body),
      keepalive: true,
    })
      .then((r) => {
        if (r.ok && localStorage.getItem(key) === JSON.stringify(body))
          localStorage.removeItem(key);
        else if (!r.ok && r.status >= 500) markNetworkLoss();
      })
      .catch(() => markNetworkLoss());
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => {
    const hide = () => flushRef.current();
    window.addEventListener("pagehide", hide);
    return () => {
      window.removeEventListener("pagehide", hide);
      if (latest.current?.phase === "working" && sync.current)
        void sync.current.run("pause", snapshot.current).catch(() => {});
    };
  }, []);
  const voiceContext: WorkoutContext = {
    exerciseType: camera && !isNewPlanProfile(type) ? type : "plan",
    countUnit: type === "high_knees" ? "对" : "次",
    reps: camera ? metrics.reps : current?.reps || 0,
    targetReps: current?.targetReps || 0,
    phase: metrics.phase,
    durationSeconds: seconds,
    bpm: null,
    active: working && !busy,
    poseStatus: camera ? metrics.poseFeedback.status : "uncertain",
    poseIssues: camera ? metrics.poseFeedback.issues : [],
    recentScore: camera ? metrics.formScore : 0,
    lastRepAt: null,
    lastRepIssues: camera ? metrics.lastRepIssues : [],
    latestVisionInsight: null,
    plan: {
      name: row?.name || "",
      exerciseName: current?.exercise.nameZh || "",
      setNumber: (current?.setIndex || 0) + 1,
      weightKg: weight,
      restSeconds:
        Math.max(
          0,
          Math.ceil((Date.parse(row?.restUntil || "") - tick) / 1000),
        ) || 0,
      phase: row?.phase || "ready",
      instruction: (capability?.instruction || current?.exercise.instructions.join(" ") || "") + (camera ? " 当前使用摄像头记组，评分仅供训练反馈。" : ""),
    },
  };
  const voice = useXiaozhiCoach({
    enabled: voiceOn && !finished,
    context: voiceContext,
    videoRef: pose.videoRef,
    visionConsent: camera && consent,
  });
  useEffect(
    () => voice.sendWorkoutContext(voiceContext),
    [row?.phase, current?.id, metrics.reps, manualReps, weight],
  );
  if (!row)
    return (
      <div className="page gym-page">
        <Header title="计划训练" />
        {error ? (
          <div className="gym-error">
            {error}
            <button onClick={() => void load()}>重新读取</button>
          </div>
        ) : (
          <p>正在恢复训练…</p>
        )}
      </div>
    );
  const rest =
    Math.max(0, Math.ceil((Date.parse(row.restUntil || "") - tick) / 1000)) ||
    0;
  return (
    <div
      data-phase={row.phase}
      className={
        "page gym-page gym-workout" + (expanded ? " gym-camera-expanded" : "")
      }
    >
      <Header
        title={finished ? "训练记录" : row.name}
        back={() => navigate("/train")}
        action={
          row.session?.gameId ? (
            <Link to={"/game/" + row.session.gameId}>返回活动</Link>
          ) : (
            <Link to="/train/plans">我的计划</Link>
          )
        }
      />
      {offline && (
        <p className="gym-error" role="status">
          离线只读 · 已停止识别与计时显示，未确认操作已保留，联网后核对再继续。
        </p>
      )}
      {error && (
        <div className="gym-error" role="alert">
          {error}
        </div>
      )}
      {blocked && (
        <div className="gym-error">
          <p>有一项操作尚未确认，识别已停止。联网后先核对服务端。</p>
          <button
            disabled={busy}
            onClick={() => {
              void recover();
            }}
          >
            读取并恢复同步
          </button>
        </div>
      )}
      {finished ? (
        <>
          <section className="gym-result">
            <span className="eyebrow">服务器已确认保存</span>
            <h2>{row.name}</h2>
            <strong>
              {row.session
                ? formatTime(row.session.effectiveSeconds)
                : "导入历史"}
            </strong>
            <p>
              {row.sets.filter((s: any) => s.status === "completed").length}{" "}
              组完成 ·{" "}
              {row.session
                ? row.session.settled
                  ? `+${row.session.xpEarned} XP`
                  : "待活动结束，按到场情况结算"
                : "历史导入不补发 XP"}
            </p>
            <p className="gym-muted">
              计划每有效分钟 1 XP，摄像头计数不额外发放 XP。
            </p>
            {row.sets.some((s:any)=>s.inputMode === "camera" && s.score?.count > 0) && <p>训练识别均分 {Math.round(row.sets.reduce((sum:number,s:any)=>sum+(s.inputMode === "camera" ? s.score?.total || 0 : 0),0)/row.sets.reduce((sum:number,s:any)=>sum+(s.inputMode === "camera" ? s.score?.count || 0 : 0),0))} 分 · 仅统计可评分的完整动作</p>}
            <Link className="primary" to="/train/records">
              查看逐组记录
            </Link>
            <SaveAsPlan id={row.id} />
            <Link className="secondary" to="/train/stats">
              查看训练分析
            </Link>
          </section>
        </>
      ) : (
        <>
          <div className="gym-workout-grid">
            <section className="gym-current">
              <div className="gym-section-title">
                <span>
                  第 {Math.min(row.cursor + 1, row.sets.length)} /{" "}
                  {row.sets.length} 组
                </span>
                <b>
                  {
                    (
                      {
                        ready: "准备开始",
                        working: "运动中",
                        resting: "组间休息",
                        paused: "已暂停",
                      } as any
                    )[row.phase]
                  }
                </b>
              </div>
              <h2>{current?.exercise.nameZh || "全部组已完成"}</h2>
              {current && (
                <>
                  <p>
                    目标{" "}
                    {current.targetSeconds
                      ? formatTime(current.targetSeconds)
                      : `${current.targetReps} ${type === "high_knees" && current.exercise.cameraType ? "对" : "次"}`}{" "}
                    ·{" "}
                    {displayWeight(
                      current.targetLoadKg ?? current.loadKg,
                      options.prefs?.unit,
                    )}{" "}
                    {options.prefs?.unit || "kg"}
                    {current.side === "each" ? " · 每侧分别完成" : ""} ·{" "}
                    {
                      (
                        {
                          warmup: "热身组",
                          work: "正式组",
                          drop: "递减组",
                          rest_pause: "休息暂停组",
                        } as any
                      )[current.kind]
                    }
                  </p>
                  <p className="gym-muted">
                    上回：
                    {row.previous?.[current.exercise.id]
                      ? `${row.previous[current.exercise.id].reps} 次 × ${displayWeight(row.previous[current.exercise.id].loadKg, options.prefs?.unit)} ${options.prefs?.unit || "kg"}`
                      : "尚无记录"}
                  </p>
                </>
              )}
              <div
                className="gym-camera"
                hidden={!camera && pose.status !== "loading"}
              >
                <PoseCanvas
                  videoRef={pose.videoRef}
                  landmarks={pose.landmarks}
                  demo={false}
                  phase={metrics.phase}
                  fit={fit}
                />
                {pose.status !== "ready" && (
                  <p className="gym-camera-overlay">
                    {pose.status === "loading"
                      ? "正在准备摄像头与模型…"
                      : "摄像头自动计数 · 全身入镜"}
                  </p>
                )}
                <div className="gym-camera-tools">
                  <button onClick={() => setExpanded((v) => !v)}>
                    {expanded ? "收起画面" : "放大画面"}
                  </button>
                  <button
                    onClick={() =>
                      setFit((v) => (v === "contain" ? "cover" : "contain"))
                    }
                  >
                    {fit === "contain" ? "铺满画面" : "完整画面"}
                  </button>
                </div>
              </div>
              {camera && (
                <div className="gym-recognition">
                  <strong>
                    {metrics.reps} / {current?.targetReps}{" "}
                    {type === "high_knees" ? "对" : "次"}
                  </strong>
                  <p>
                    {!working ? "已暂停识别；继续后重新校准" : metrics.feedback}
                  </p>
                  <small>
                    {isNewPlanProfile(type) && <>本次评分 {metrics.lastRepScore == null ? "无法判断／待完成" : metrics.lastRepScore + " 分"} · </>}
                    {metrics.scoreAccumulator.count
                      ? `识别均分 ${metrics.formScore}`
                      : "尚无完整动作评分"}
                  </small>
                  {capability && metrics.scoreAccumulator.count > 0 && <p className="gym-muted">{capability.axes.map((name:string,i:number)=>name+" "+metrics.formBreakdown[(["depth","stability","trunk","symmetry"] as const)[i]]).join(" · ")}（已评分 {metrics.scoreAccumulator.count} 次）</p>}
                  {type === "reverse_lunge" && <p>左侧 {metrics.scoreAccumulator.leftReps || 0} 次 · 右侧 {metrics.scoreAccumulator.rightReps || 0} 次 · 每侧完成计一次</p>}
                  <p>{metrics.poseFeedback.primaryIssue ? metrics.poseFeedback.message : ""}</p>
                  <PlanRecognitionStatus
                    type={type}
                    diagnostics={diagnostics}
                    paused={!working || busy || blocked}
                  />
                </div>
              )}
              {current && (
                <details className="gym-instructions">
                  <summary>动作步骤与注意事项</summary>
                  <ol>
                    {current.exercise.instructions.map(
                      (t: string, i: number) => (
                        <li key={i}>{t}</li>
                      ),
                    )}
                  </ol>
                </details>
              )}
            </section>
            <aside className="gym-controls">
              <div className="gym-effective">
                <span>累计有效运动</span>
                <strong>{formatTime(seconds)}</strong>
                <small>休息与暂停不计入 XP</small>
              </div>
              {row.phase === "resting" && current && (
                <div className="gym-rest" role="timer">
                  <span>组间休息</span>
                  <strong>{rest ? formatTime(rest) : "休息结束"}</strong>
                  <p>准备好后，手动开始下一组。</p>
                  <div className="gym-inline-actions">
                    <button
                      disabled={busy || blocked}
                      onClick={() => act("rest", { restDelta: -15 })}
                    >
                      −15 秒
                    </button>
                    <button
                      disabled={busy || blocked}
                      onClick={() => act("rest", { restDelta: 15 })}
                    >
                      +15 秒
                    </button>
                    <button
                      disabled={busy || blocked}
                      onClick={() => act("rest", { restSkip: true })}
                    >
                      跳过休息
                    </button>
                  </div>
                </div>
              )}
              {current?.targetSeconds > 0 && (
                <div className="gym-rest">
                  <span>本组目标倒计时</span>
                  <strong>
                    {formatTime(
                      Math.max(
                        0,
                        current.targetSeconds -
                          (row.setElapsedSeconds || 0) -
                          (working
                            ? Math.max(
                                0,
                                Math.floor(
                                  (tick - (row.session?.receivedAt || tick)) /
                                    1000,
                                ),
                              )
                            : 0),
                      ),
                    )}
                  </strong>
                  <small>达到目标后请确认完成本组，结束累计本组时长。</small>
                </div>
              )}
              {working &&
                current &&
                row.personalBests?.[current.exercise.id] &&
                (weight > row.personalBests[current.exercise.id].loadKg ||
                  (weight >= row.personalBests[current.exercise.id].loadKg &&
                    (camera ? metrics.reps : manualReps) >
                      row.personalBests[current.exercise.id].reps)) && (
                  <p className="gym-success" role="status">
                    本组超过历史最佳；确认完成并保存后计入个人纪录。
                  </p>
                )}
              {current && !camera && (
                <div className="gym-two">
                  <label>
                    本组实际次数（上回建议，完成时确认）
                    <input
                      type="number"
                      min="0"
                      max="100000"
                      value={manualReps}
                      onChange={(e) =>
                        setManualReps(Math.max(0, Number(e.target.value)))
                      }
                    />
                  </label>
                  <WeightInput
                    kg={weight}
                    unit={options.prefs?.unit || "kg"}
                    onChange={setWeight}
                  />
                </div>
              )}
              {current && camera && <WeightInput kg={weight} unit={options.prefs?.unit || "kg"} onChange={setWeight}/>}
              {current &&
                options.prefs?.effort !== "off" &&
                options.prefs?.effort && (
                  <label>
                    本组 {options.prefs.effort.toUpperCase()}（可不填）
                    <input
                      type="number"
                      min="0"
                      max="10"
                      step="0.5"
                      value={effort ?? ""}
                      onChange={(e) =>
                        setEffort(
                          e.target.value === "" ? null : Number(e.target.value),
                        )
                      }
                    />
                  </label>
                )}
              {current && (
                <label>
                  本组备注（可选）
                  <input
                    maxLength={500}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </label>
              )}
              {!working && canRecognize && (
                <section className="gym-camera-preparation">
                  <strong>摄像头自动记组{capability ? " · 试用" : ""}</strong>
                  <p>本组目标 {current.targetReps} {type === "high_knees" ? "对" : "次"}，达到目标后自动进入休息。</p>
                  <p>{capability?.placement || exerciseInfo(type).placement}</p>
                  <p>{capability?.instruction || exerciseInfo(type).instruction}</p>
                  {capability && <small>需看清：{capability.joints}。{capability.limitations}</small>}
                  <p className="gym-muted">计划内只按有效运动时长结算 XP，不按动作重复奖励。</p>
                </section>
              )}
              {!working && canRecognize && (
                <label className="gym-checkbox">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  允许语音陪练复核关键帧（可选，本站不保存图片）
                </label>
              )}
              <div className="gym-main-actions">
                {current && ["ready", "resting"].includes(row.phase) && (
                  <>
                    <button
                      className="primary"
                      disabled={busy || blocked}
                      onClick={() => void start("manual")}
                    >
                      {busy ? "正在准备…" : "手动记录 · 开始本组"}
                    </button>
                    {canRecognize && (
                        <button
                          className="secondary"
                          disabled={busy || blocked}
                          onClick={() => void start("camera")}
                        >
                          摄像头自动记组
                        </button>
                      )}
                    <button
                      className="text-btn"
                      disabled={busy || blocked}
                      onClick={() => act("skip")}
                    >
                      跳过本组
                    </button>
                  </>
                )}
                {current && working && (
                  <>
                    <button
                      className="primary"
                      disabled={busy || blocked}
                      onClick={() => act("complete", snapshot.current)}
                    >
                      完成本组，开始休息
                    </button>
                    <button
                      className="secondary"
                      disabled={busy || blocked}
                      onClick={() => act("pause", snapshot.current)}
                    >
                      暂停
                    </button>
                  </>
                )}
                {current && row.phase === "paused" && (
                  <>
                    <button
                      className="primary"
                      disabled={busy || blocked}
                      onClick={() =>
                        void start(camera ? "camera" : "manual", true)
                      }
                    >
                      继续本组
                    </button>
                    <button
                      className="secondary"
                      disabled={busy || blocked}
                      onClick={() => act("complete", snapshot.current)}
                    >
                      确认本组完成
                    </button>
                    <button
                      className="text-btn"
                      disabled={busy || blocked}
                      onClick={() => act("skip", snapshot.current)}
                    >
                      跳过当前组（保留已记录）
                    </button>
                    {camera && (
                      <button
                        className="text-btn"
                        disabled={busy || blocked}
                        onClick={() => {
                          act("manual", snapshot.current);
                          pose.stop();
                          setManualReps(metrics.reps);
                        }}
                      >
                        摄像头不可用，改为手动（取消本组评分）
                      </button>
                    )}
                  </>
                )}
                <button
                  className={current ? "text-btn" : "primary"}
                  disabled={busy || blocked}
                  onClick={() => setFinishDialog(true)}
                >
                  结束整次训练
                </button>
              </div>
              <section className="gym-voice">
                <b>语音陪练</b>
                <p>
                  {voiceOn
                    ? (
                        {
                          idle: "可对话",
                          listening: "我在听",
                          speaking: "正在回复",
                          thinking: "正在思考",
                          connecting: "连接中",
                          reconnecting: "网络恢复中",
                          fallback: "本地文字反馈",
                          failed: "语音暂不可用",
                        } as any
                      )[voice.state] || voice.state
                    : "手动开启，共用现有语音设备池"}
                </p>
                {voice.errorMessage && (
                  <p role="status">{voice.errorMessage}</p>
                )}
                <button
                  className="secondary"
                  disabled={offline}
                  onClick={() => {
                    if (!voiceOn) {
                      voice.prepareAudio();
                      setVoiceOn(true);
                    } else if (voice.state === "idle") void voice.wake();
                    else {
                      setVoiceOn(false);
                    }
                  }}
                >
                  {!voiceOn
                    ? "开启语音陪练"
                    : voice.state === "idle"
                      ? "点击对话"
                      : "关闭语音陪练"}
                </button>
                {voice.reply && <p>{voice.reply}</p>}
              </section>
            </aside>
          </div>
        </>
      )}
      {!finished && (
        <>
          <WorkoutEditor row={row} run={run} busy={busy || blocked} />
          {options.settings}
          <PlateCalculator />
          {options.deviceMessage && (
            <p role="status">{options.deviceMessage}</p>
          )}
        </>
      )}
      <details className="gym-all-sets">
        <summary>查看全部训练组</summary>
        {row.sets.map((s: any, i: number) => (
          <div className="gym-list-row" key={s.id}>
            <span>
              {i + 1}. {s.exercise.nameZh} · {s.targetReps}{" "}
              {s.exercise.cameraType === "high_knees" ? "对" : "次"} /{" "}
              {s.loadKg}kg
            </span>
            <b>
              {
                (
                  {
                    pending: "未开始",
                    working: "当前组",
                    completed: "已完成",
                    skipped: "已跳过",
                    removed: "已移除（可撤销）",
                  } as any
                )[s.status]
              }
            </b>
          </div>
        ))}
      </details>
      {finishDialog && (
        <Dialog
          title="结束本次计划训练？"
          onClose={() => setFinishDialog(false)}
        >
          <p>
            以服务端有效运动时长结算，休息不计 XP。未开始的组不会记录为完成。
          </p>
          <button
            className="primary"
            disabled={busy}
            onClick={() => {
              void run("finish", snapshot.current)
                .then(() => setFinishDialog(false))
                .catch(() => setFinishDialog(false));
            }}
          >
            确认结束并保存
          </button>
        </Dialog>
      )}
    </div>
  );
}
