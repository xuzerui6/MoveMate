import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";
import { Header } from "../motion/components/Header";
import { PoseCanvas } from "../motion/components/PoseCanvas";
import { RecognitionStatus } from "../motion/components/RecognitionStatus";
import { usePose } from "../motion/hooks/usePose";
import { useExerciseMetrics } from "../motion/hooks/useExerciseMetrics";
import { useXiaozhiCoach } from "../motion/hooks/useXiaozhiCoach";
import { useSessionClock } from "../motion/hooks/useSessionClock";
import { useStore } from "../motion/lib/store";
import type { WorkoutContext } from "../motion/types";
import { request, getErrorMessage, formatTime } from "./api";
import { WorkoutSync, restoredSetMetrics } from "./workoutSync";
import Dialog from "../../components/Dialog";
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
    key = `gym:pending:${uid}:${workoutId}`;
  const [row, setRow] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [blocked, setBlocked] = useState(false),
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
        () =>
          request("GET", "/workout-sessions/" + workoutId, undefined, token),
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
      setBlocked(!!localStorage.getItem(key));
      if (
        raw.phase === "working" &&
        raw.sets[raw.cursor]?.inputMode === "camera" &&
        !localStorage.getItem(key)
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
  const pose = usePose(camera && working && !busy && !blocked),
    seconds = useSessionClock(row?.session, busy);
  const type = current?.exercise.cameraType || "squat";
  const restored = useMemo(
    () => restoredSetMetrics(current),
    [current?.id, recoveryKey],
  );
  const { metrics, diagnostics } = useExerciseMetrics(
    type,
    pose.landmarks,
    false,
    camera && pose.status === "ready",
    !working || busy || blocked,
    pose.videoRef.current?.videoWidth && pose.videoRef.current.videoHeight
      ? pose.videoRef.current.videoWidth / pose.videoRef.current.videoHeight
      : 1,
    restored,
    current?.targetReps || 20,
    (current?.id || "none") + ":" + recoveryKey,
    pose.worldLandmarks,
  );
  const snapshot = useRef<any>({});
  snapshot.current = camera
    ? { reps: metrics.reps, loadKg: weight, score: metrics.scoreAccumulator }
    : { reps: current?.targetSeconds ? 0 : manualReps, loadKg: weight };
  useEffect(() => {
    if (!current || loadedId.current === current.id + ":" + recoveryKey) return;
    loadedId.current = current.id + ":" + recoveryKey;
    setManualReps(
      current.reps || (current.targetSeconds ? 0 : current.targetReps),
    );
    setWeight(current.loadKg);
    lastSynced.current = current.reps;
  }, [current?.id, recoveryKey]);
  const run = async (action: string, values: any = {}, control = true) => {
    if (!sync.current || (control && controlLock.current)) return;
    if (control) {
      controlLock.current = true;
      setBusy(true);
    }
    setError("");
    try {
      return await sync.current.run(action, values);
    } catch (e: any) {
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
          "摄像头或模型未就绪。请允许摄像头后重试，或改为手动记录。",
        );
      if (!alive.current) return;
      await sync.current!.run(
        resume ? "resume" : "start",
        resume ? {} : { inputMode: mode },
      );
    } catch (e: any) {
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
      })
      .catch(() => {});
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
    exerciseType: camera ? type : "plan",
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
      instruction: current?.exercise.instructions.join(" ") || "",
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
        action={row.session?.gameId?<Link to={'/game/'+row.session.gameId}>返回活动</Link>:<Link to="/train/plans">我的计划</Link>}
      />
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
            <Link className="primary" to="/train/records">
              查看逐组记录
            </Link>
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
                    · {current.loadKg} kg
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
                      ? `${row.previous[current.exercise.id].reps} 次 × ${row.previous[current.exercise.id].loadKg} kg`
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
                    {!working
                      ? "已暂停识别；继续后重新校准"
                      : metrics.feedback}
                  </p>
                  <small>
                    {metrics.scoreAccumulator.count
                      ? `识别均分 ${metrics.formScore}`
                      : "尚无完整动作评分"}
                  </small>
                  <RecognitionStatus type={type} diagnostics={diagnostics} paused={!working || busy || blocked}/>
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
              {current && !camera && (
                <div className="gym-two">
                  <label>
                    本组实际次数
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
                  <label>
                    外部负重 kg
                    <input
                      type="number"
                      min="0"
                      max="1000"
                      step="0.25"
                      value={weight}
                      onChange={(e) =>
                        setWeight(Math.max(0, Number(e.target.value)))
                      }
                    />
                  </label>
                </div>
              )}
              {!working && current?.exercise.cameraType && (
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
                    {current.exercise.cameraType &&
                      !current.targetSeconds &&
                      current.side === "both" && (
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
