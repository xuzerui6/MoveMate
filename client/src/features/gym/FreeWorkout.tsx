import { useEffect, useState } from "react";
import { useAuthStore } from "../../stores/authStore";
import { useNavigate } from "react-router-dom";
import { Header } from "../motion/components/Header";
import { ExerciseLibrary } from "./Library";
import { readDraft, writeDraft, removeDraft, draftWriteWarning } from "./draftStorage";
import { repUnit } from "./trainingPresentation";
import { beginWorkout, getErrorMessage } from "./api";
export default function FreeWorkout() {
  const uid = useAuthStore((s) => s.user?.id),
    draftKey = "gym:free:" + uid;
  const [restored] = useState(() => readDraft<any[]>(draftKey, value => Array.isArray(value) && value.every(e => e && typeof e.id==='string' && typeof e.nameZh==='string')));
  const [picked, setPicked] = useState<any[]>(() => (restored.value || []).slice(0,30)),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [storageWarning,setStorageWarning]=useState(restored.state==='invalid'?'本机自由训练草稿损坏，未自动载入。':restored.state==='unavailable'?'本机草稿无法读取，仍可选择动作并联网开始。':'');
  const [invalidDraft,setInvalidDraft]=useState(restored.state==='invalid');
  const navigate = useNavigate();
  useEffect(() => {
    if (useAuthStore.getState().user?.id !== uid || invalidDraft) return;
    setStorageWarning(writeDraft(draftKey,picked)?'':draftWriteWarning);
  }, [picked, draftKey, invalidDraft]);
  return (
    <div className="page gym-page">
      <Header title="自由训练" />
      <p className="gym-muted">
        先选动作，再开始。训练中可以调整，结束后可以另存为新计划。
      </p>
      {storageWarning && <div className="gym-cache-notice" role="status"><p>{storageWarning}</p>{invalidDraft && <button onClick={()=>{if(removeDraft(draftKey)){setInvalidDraft(false);setStorageWarning('');}else setStorageWarning('本机草稿暂时无法清理，仍可重新选择动作。');}}>放弃损坏草稿</button>}</div>}
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
              {e.category === "timed" ? "30 秒" : "10 " + repUnit(e)}
              {e.planCamera ? " · 摄像头试用" : e.cameraType ? " · 支持摄像头" : " · 手动记录"}
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
              removeDraft(draftKey);
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
        onPick={(e) => {setInvalidDraft(false);setPicked((v) => (v.length < 30 ? [...v, e] : v));}}
      />
    </div>
  );
}
