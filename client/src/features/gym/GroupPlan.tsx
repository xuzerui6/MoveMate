import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStore } from "../motion/lib/store";
import SportTimer from "../motion/SportTimer";
import { request, useGymQuery, getErrorMessage, beginWorkout } from "./api";
export default function GroupPlan({
  game,
  canTrain,
}: {
  game: any;
  canTrain: boolean;
}) {
  const q = useGymQuery("/games/" + game.id + "/training-plan"),
    plans = useGymQuery("/training-plans"),
    [planId, setPlanId] = useState(""),
    [routineId, setRoutineId] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    navigate = useNavigate(),
    { sessions, refresh } = useStore();
  const observed = useRef(game);
  useEffect(() => {
    if (observed.current !== game) {
      observed.current = game;
      q.reload();
    }
  }, [game, q.reload]);
  const active = sessions.find((s) => s.gameId === game.id),
    selected = plans.data?.items.find((p: any) => p.id === planId);
  return (
    <section className="gym-page gym-group-plan">
      <div className="gym-section-title">
        <h3>一起按计划练</h3>
        <span>各自记录，各自结算</span>
      </div>
      {(q.error || error) && (
        <div className="gym-error">
          {q.error || error}
          <button onClick={q.reload}>重新读取</button>
        </div>
      )}
      {q.loading ? (
        <p>正在读取活动计划…</p>
      ) : q.data?.snapshot ? (
        <>
          <h3>{q.data.snapshot.name}</h3>
          <p>{q.data.snapshot.sets.length} 组 · 计划内摄像头不额外奖励 XP</p>
          <details>
            <summary>查看共同动作安排</summary>
            {q.data.snapshot.sets.map((s: any, i: number) => (
              <p key={i}>
                {i + 1}. {s.exercise.nameZh} ·{" "}
                {s.seconds
                  ? `${s.seconds} 秒`
                  : `${s.reps} ${s.exercise.cameraType === "high_knees" ? "对" : "次"}`}
              </p>
            ))}
          </details>
          <p className="gym-muted">
            只共享动作目标，重量由每位成员自行记录。须签到并在活动开始后训练。
          </p>
        </>
      ) : (
        <p>发起人可在健身活动开始前附上训练日。</p>
      )}
      {q.data?.canEdit &&
        ["recruiting", "full", "ready"].includes(game.status) && (
          <div className="gym-two">
            <label>
              选择我的计划
              <select
                value={planId}
                onChange={(e) => {
                  setPlanId(e.target.value);
                  setRoutineId("");
                }}
              >
                <option value="">请选择</option>
                {plans.data?.items.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              训练日
              <select
                value={routineId}
                onChange={(e) => setRoutineId(e.target.value)}
              >
                <option value="">请选择</option>
                {selected?.routines.map((r: any) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="secondary"
              disabled={busy || !routineId}
              onClick={() => {
                setBusy(true);
                void request("PUT", "/games/" + game.id + "/training-plan", {
                  planId,
                  routineId,
                })
                  .then(() => q.reload())
                  .catch((e) => setError(getErrorMessage(e)))
                  .finally(() => setBusy(false));
              }}
            >
              附上这个训练日
            </button>
            <Link to="/train/plans">管理我的计划</Link>
          </div>
        )}
      {active?.workoutId ? (
        <Link className="primary" to={"/train/workout/" + active.workoutId}>
          {active.status === "finished" ? "查看训练结算" : "继续计划训练"}
        </Link>
      ) : canTrain && q.data?.snapshot && !active ? (
        <button
          className="primary"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void beginWorkout({ gameId: game.id })
              .then((w) => {
                void refresh();
                navigate("/train/workout/" + w.id);
              })
              .catch((e) => setError(getErrorMessage(e)))
              .finally(() => setBusy(false));
          }}
        >
          开始我的计划训练
        </button>
      ) : null}
      {canTrain && !q.data?.snapshot && !q.loading && !q.error && (
        <SportTimer
          gameId={game.id}
          sportType="fitness"
          enabled={game.status === "in_progress"}
        />
      )}
      {active && !active.workoutId && q.data?.snapshot && (
        <>
          <p>你已开始普通计时，本次继续原记录，避免重复计时。</p>
          <SportTimer
            gameId={game.id}
            sportType="fitness"
            enabled={game.status === "in_progress"}
          />
        </>
      )}
    </section>
  );
}
