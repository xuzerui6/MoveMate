import { useEffect, useRef, useState } from "react";
import Dialog from "../../components/Dialog";
import paths from "./muscle-paths.json";
import { label } from "./api";
import { mediaSummaryFor, muscleRegions, type ExerciseMedia as Media } from "./media";
import {useExerciseMedia} from './mediaLoader';
import { demoPlayback } from "./mediaPlayback";
import "./exercise-media.css";

// Only demonstration players register here; camera streams are never touched.
function Video({ media, suspended }: { media: Media; suspended: boolean }) {
  const video = useRef<HTMLVideoElement>(null),
    [loaded, setLoaded] = useState(false),
    [playing, setPlaying] = useState(false),
    [error, setError] = useState(""),
    [rate, setRate] = useState("1");
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    const release = demoPlayback.register(el);
    const hide = () => {
      if (document.hidden) el.pause();
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      release();
      el.removeAttribute("src");
      el.load();
    };
  }, []);
  useEffect(() => {
    if (suspended) video.current?.pause();
  }, [suspended]);
  async function play(replay = false) {
    const el = video.current;
    if (!el || suspended) return;
    setError("");
    if (!loaded) {
      el.src = media.video!.src;
      setLoaded(true);
    }
    if (replay) el.currentTime = 0;
    el.playbackRate = Number(rate);
    try {
      await el.play();
    } catch {
      setError(
        navigator.onLine
          ? "视频暂时无法播放，请重试。"
          : "当前离线，动态示范未缓存；可查看图片和文字。",
      );
    }
  }
  return (
    <>
      <div className="exercise-media-stage" style={{aspectRatio:media.video?.aspectRatio||16/9}}>
        <video
          ref={video}
          poster={media.video!.poster}
          preload="none"
          muted
          playsInline
          controls={loaded && !suspended}
          onPlay={() => {
            if (video.current) {
              if (suspended) {
                video.current.pause();
                return;
              }
              demoPlayback.play(video.current);
              setPlaying(true);
            }
          }}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={() =>
            setError(
              navigator.onLine
                ? "视频加载失败，请重试或查看动作分解。"
                : "当前离线，动态示范未缓存。",
            )
          }
          aria-label="连续动作示范视频"
        />
        {!loaded && !suspended && (
          <button
            type="button"
            className="media-play primary"
            onClick={() => void play()}
          >
            播放动态示范
          </button>
        )}
      </div>
      <div className="media-controls">
        <button
          type="button"
          disabled={suspended}
          onClick={() => (playing ? video.current?.pause() : void play())}
        >
          {playing ? "暂停" : "播放"}
        </button>
        <button
          type="button"
          disabled={suspended}
          onClick={() => void play(true)}
        >
          重播
        </button>
        <label>
          速度
          <select
            value={rate}
            onChange={(e) => {
              setRate(e.target.value);
              if (video.current)
                video.current.playbackRate = Number(e.target.value);
            }}
          >
            <option value="0.5">0.5×</option>
            <option value="1">1×</option>
            <option value="1.5">1.5×</option>
            <option value="2">2×</option>
          </select>
        </label>
        <small>连续视频 · 默认静音</small>
      </div>
      {error && (
        <div className="media-error" role="status">
          {error}
          <button
            type="button"
            onClick={() => {
              setError("");
              setLoaded(false);
              setPlaying(false);
              const el = video.current;
              if (el) {
                el.pause();
                el.removeAttribute("src");
                el.load();
              }
            }}
          >
            重新加载
          </button>
        </div>
      )}
    </>
  );
}
function Still({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false),
    [attempt, setAttempt] = useState(0);
  useEffect(() => setFailed(false), [src]);
  return failed ? (
    <div className="media-error" role="status">
      图片未加载，离线时可能尚未缓存。
      <button
        type="button"
        onClick={() => {
          setFailed(false);
          setAttempt(attempt + 1);
        }}
      >
        重试图片
      </button>
    </div>
  ) : (
    <img
      key={attempt}
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
export function ExerciseMuscles({ exercise }: { exercise: any }) {
  const primary = muscleRegions(exercise?.target),
    secondary = (exercise?.secondaryMuscles || []).flatMap(muscleRegions);
  return (
    <div className="exercise-muscles">
      <div className="exercise-muscle-pair">
        {(["front", "back"] as const).map((side) => (
          <svg
            key={side}
            viewBox={side === "front" ? "0 95 727 1280" : "718 95 727 1280"}
            role="img"
            aria-label={side === "front" ? "正面肌群" : "背面肌群"}
          >
            {paths[side].map((m, i) => (
              <g key={i}>
                {m.paths.map((p, j) => (
                  <path
                    key={j}
                    d={p}
                    fill={
                      primary.includes(m.muscle)
                        ? "#008b43"
                        : secondary.includes(m.muscle)
                          ? "#9be5ba"
                          : "#e5ece8"
                    }
                    stroke="#fff"
                    strokeWidth="3"
                  />
                ))}
              </g>
            ))}
          </svg>
        ))}
      </div>
      <p>
        <span className="media-swatch primary-muscle" />
        主练：{label(exercise?.target || "未标注")}
        <br />
        <span className="media-swatch secondary-muscle" />
        辅助：{exercise?.secondaryMuscles?.map(label).join("、") || "未标注"}
      </p>
      <small>
        肌群位置示意；未标注的区域不推断。非动作示范或身体恢复评估。图形来自 <a href="/licenses/MuscleMap-MIT.txt" target="_blank" rel="noreferrer">MuscleMap · MIT</a>。
      </small>
    </div>
  );
}
function Viewer({
  exercise,
  suspended = false,
}: {
  exercise: any;
  suspended?: boolean;
}) {
  const state=useExerciseMedia(exercise.id);
  if(state.loading)return <p className="media-pending" role="status">正在读取此动作的示范资料…</p>;
  if(state.error)return <div className="media-error" role="status">{state.error}<button type="button" onClick={state.retry}>重试示范资料</button></div>;
  return <LoadedViewer key={exercise.id} exercise={exercise} suspended={suspended} media={state.media||undefined}/>;
}
function LoadedViewer({exercise,suspended=false,media}:{exercise:any;suspended?:boolean;media?:Media}){
  const
    [tab, setTab] = useState<"video" | "stills" | "muscles">(
      media?.video ? "video" : media?.images.length ? "stills" : "muscles",
    ),
    [frame, setFrame] = useState(0);
  const currentFrame = media?.images[frame];
  const frameSource = currentFrame?.sourceIndex == null
    ? undefined : media?.sources[currentFrame.sourceIndex];
  return (
    <>
      {exercise.reviewStatus==='needs_review'&&<p className="media-pending" role="note"><strong>资料待核对</strong> · {exercise.reviewReason}</p>}
      {exercise.form&&<p className="media-note"><strong>适用形式：</strong>{exercise.form}</p>}
      <div
        className="media-tabs"
        role="tablist"
        aria-label="动作示范类型"
        onKeyDown={(e) => {
          if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key))
            return;
          const buttons = Array.from(
            e.currentTarget.querySelectorAll<HTMLButtonElement>(
              "button:not(:disabled)",
            ),
          );
          const at = buttons.indexOf(e.target as HTMLButtonElement);
          const next =
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? buttons.length - 1
                : (at + (e.key === "ArrowRight" ? 1 : -1) + buttons.length) %
                  buttons.length;
          e.preventDefault();
          buttons[next]?.focus();
          buttons[next]?.click();
        }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "video"}
          disabled={!media?.video}
          onClick={() => setTab("video")}
        >
          {media?.video ? "动态示范" : "动态待补"}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "stills"}
          disabled={!media?.images.length}
          onClick={() => setTab("stills")}
        >
          {media?.images.length ? "动作分解" : "图片待补"}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "muscles"}
          onClick={() => setTab("muscles")}
        >
          肌群
        </button>
      </div>
      <div role="tabpanel">
        {tab === "video" && media?.video && (
          <Video media={media} suspended={suspended} />
        )}
        {tab === "stills" && media && currentFrame && (
          <>
            <div className="exercise-media-stage">
              <Still
                src={currentFrame.src}
                alt={`${exercise.nameZh} · ${currentFrame.phase || "动作分解"}`}
              />
            </div>
            <div className="media-controls">
              {media.images.map((im, i) => (
                <button
                  type="button"
                  key={im.src}
                  aria-pressed={frame === i}
                  onClick={() => setFrame(i)}
                >
                  {im.phase || `分解 ${i + 1}`}
                </button>
              ))}
              <small>
                {media.images.length === 2
                  ? "双帧分解图，不是连续动画"
                  : "动作分解图片"}
              </small>
            </div>
            <p className="media-frame-caption" aria-live="polite">
              {frame + 1} / {media.images.length} · {currentFrame.phase || "动作分解"}
              {currentFrame.sourceTime != null && (
                <span> · 原片 {currentFrame.sourceTime} 秒</span>
              )}
              {frameSource && (
                <span> · 来源：<a href={frameSource.url} target="_blank" rel="noreferrer">{frameSource.name}</a></span>
              )}
            </p>
          </>
        )}
        {tab === "muscles" && <ExerciseMuscles exercise={exercise} />}
      </div>
      {!media && (
        <p className="media-pending">
          示范待补 · 肌群图只表示部位；下方来源步骤尚待核对，不用相近动作替代。
        </p>
      )}
      {suspended && (
        <p className="media-pending" role="status">
          正在训练，示范已暂停；不影响摄像头识别与本组计时。
        </p>
      )}
      {media && (
        <>
          {media.kind==='illustration'&&<p className="media-note" role="note">原创动作示意，非真人实拍、非专业教学认证。请结合文字核对器械与支撑方式。</p>}
          <p className="media-note">{media.note}</p>
          <details className="media-attribution">
            <summary>素材来源与许可</summary>
            {media.sources.map((s, i) => (
              <p key={i}>
                <a href={s.url} target="_blank" rel="noreferrer">{s.name}</a> · {s.author} ·{" "}
                <a href={s.licenseUrl} target="_blank" rel="noreferrer">
                  {s.license}
                </a>
                <br />
                {s.changes}
                <br />
                <small>固定版本：{s.version}</small>
              </p>
            ))}
            <a
              href="/exercise-media/attribution.json"
              target="_blank"
              rel="noreferrer"
            >
              完整来源及校验清单
            </a>
          </details>
        </>
      )}
      {!!exercise.cues?.length&&<div className="media-note"><strong>主要注意点</strong><ul>{exercise.cues.map((cue:string,i:number)=><li key={i}>{cue}</li>)}</ul></div>}
    </>
  );
}
export function ExerciseMediaPanel({
  exercise,
  suspended = false,
}: {
  exercise: any;
  suspended?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (suspended) setExpanded(false);
  }, [suspended]);
  return (
    <section className="exercise-media" aria-label={exercise.nameZh + "示范"}>
      <div className="media-heading">
        <strong>先看示范，再开始</strong>
        <button
          type="button"
          disabled={suspended}
          onClick={() => setExpanded(true)}
        >
          放大查看
        </button>
      </div>
      {expanded ? (
        <p className="media-pending">示范正在放大窗口中展示。</p>
      ) : (
        <Viewer key={exercise.id} exercise={exercise} suspended={suspended} />
      )}
      {expanded && (
        <Dialog
          title={exercise.nameZh + " · 动作示范"}
          onClose={() => setExpanded(false)}
        >
          <div className="exercise-media media-expanded">
            <Viewer
              key={exercise.id}
              exercise={exercise}
              suspended={suspended}
            />
          </div>
        </Dialog>
      )}
    </section>
  );
}
export function ExerciseDemo({
  exercise,
  suspended = false,
}: {
  exercise: any;
  suspended?: boolean;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [exercise?.id]);
  if (!exercise) return null;
  return (
    <details
      className="exercise-demo-disclosure"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        查看动作示范{mediaSummaryFor(exercise.id) ? " · 站内图文" : " · 资料待核对"}
      </summary>
      {open && (
        <ExerciseMediaPanel
          key={exercise.id}
          exercise={exercise}
          suspended={suspended}
        />
      )}
    </details>
  );
}
export function ExerciseThumb({ exercise }: { exercise: any }) {
  const m = mediaSummaryFor(exercise.id),
    src = m?.thumb,
    [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return (
    <span className="exercise-thumbnail">
      {src && !failed ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <span>{failed ? "加载失败" : "示范待补"}</span>
      )}
    </span>
  );
}
