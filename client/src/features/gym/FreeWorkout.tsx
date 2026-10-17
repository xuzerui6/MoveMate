import { useEffect, useState } from "react";
import { useAuthStore } from "../../stores/authStore";
import { useNavigate } from "react-router-dom";
import { Header } from "../motion/components/Header";
import { ExerciseLibrary } from "./Library";
import { beginWorkout, getErrorMessage } from "./api";
export default function FreeWorkout() {
  const uid = useAuthStore((s) => s.user?.id),
    draftKey = "gym:free:" + uid;
  const [picked, setPicked] = useState<any[]>(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(draftKey) || "[]");
        return Array.isArray(saved) ? saved.slice(0, 30) : [];
      } catch {
        return [];
      }
    }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    try {
      if (useAuthStore.getState().user?.id === uid)
        localStorage.setItem(draftKey, JSON.stringify(picked));
    } catch {}
  }, [picked, draftKey]);
  return (
    <div className="page gym-page">
      <Header title="自由训练" />
      <p className="gym-muted">
        先选动作，再开始。训练中可以调整，结束后可以另存为新计划。
      </p>
      {error && (
        <p className="gym-error" role="alert">
          {error}
        </p>
      )}
      <section className="gym-form">
        <h3>本次安排 · {picked.length} 个动作</h3>
        {picked.map((e, i) => (
          <div className="gym-list-row" key={i}>
            <span>
              {i + 1}. {e.nameZh} · 3 组 ×{" "}
              {e.category === "timed" ? "30 秒" : "10 次"}
            </span>
            <button
              onClick={() => setPicked((v) => v.filter((_, n) => n !== i))}
            >
              移除
            </button>
          </div>
        ))}
        <button
          className="primary"
          disabled={!picked.length || busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const w = await beginWorkout({
                free: {
                  name: "自由训练",
                  exercises: picked.map((e) => ({
                    exerciseId: e.id,
                    sets: Array.from({ length: 3 }, () => ({
                      reps: 10,
                      seconds: e.category === "timed" ? 30 : 0,
                      restSec: 90,
                    })),
                  })),
                },
              });
              localStorage.removeItem(draftKey);
              navigate("/train/workout/" + w.id);
            } catch (e) {
              setError(getErrorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "正在准备…" : "确认动作，进入训练"}
        </button>
      </section>
      <ExerciseLibrary
        onPick={(e) => setPicked((v) => (v.length < 30 ? [...v, e] : v))}
      />
    </div>
  );
}
