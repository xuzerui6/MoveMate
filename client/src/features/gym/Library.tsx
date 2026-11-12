import { useEffect, useRef, useState } from "react";
import { Header } from "../motion/components/Header";
import { Icon } from "../motion/components/Icons";
import { useNavigate } from "react-router-dom";
import { label, request, useGymQuery, getErrorMessage } from "./api";
import { CameraCapability } from "./CameraCapability";
import { ExerciseMediaPanel, ExerciseThumb } from "./ExerciseMedia";
import { mediaSummaryFor, REGION_LABELS, type MediaFilter } from "./media";
import { MuscleBrowser } from "./MuscleBrowser";
import { useAuthStore } from "../../stores/authStore";
import { CachedDataNotice } from "./CachedDataNotice";
import { FavoriteRequests, mergeExercisePage } from "./libraryState";
import { recentExerciseIds } from "./recent";
export function ExerciseLibrary({
  onPick,
}: {
  onPick?: (exercise: any) => void;
}) {
  const uid = useAuthStore(s => s.user?.id);
  const [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [muscle, setMuscle] = useState(
      new URLSearchParams(location.search).get("muscle") || "",
    ),
    [equipment, setEquipment] = useState(""),
    [category, setCategory] = useState(""),
    [favorite, setFavorite] = useState(false),
    [cameraOnly, setCameraOnly] = useState(false),
    [demoFilter, setDemoFilter] = useState<MediaFilter>("all"),
    [owned, setOwned] = useState(false),
    [archived, setArchived] = useState(false),
    [role, setRole] = useState("primary"),
    [editing, setEditing] = useState<any>(null),
    [cursor, setCursor] = useState(0),
    [items, setItems] = useState<any[]>([]),
    [selected, setSelected] = useState<any>(null),
    [creating, setCreating] = useState(false),
    [error, setError] = useState(""),
    [total, setTotal] = useState(0),
    [next, setNext] = useState<number | null>(null),
    [readOnly, setReadOnly] = useState(false),
    [facets, setFacets] = useState<{muscles: string[]; equipment: string[]}>({muscles: [], equipment: []}),
    [region, setRegion] = useState(""),
    [mapOpen, setMapOpen] = useState(!onPick),
    [favoritePending, setFavoritePending] = useState<Set<string>>(new Set()),
    [favoriteErrors, setFavoriteErrors] = useState<Record<string, {message: string; enabled: boolean}>>({}),
    [recentIds, setRecentIds] = useState<string[] | null>(null),
    [recentBusy, setRecentBusy] = useState(false),
    [recentNote, setRecentNote] = useState("");
  const favorites = useRef(new Map<string, boolean>()), favoriteRequests = useRef(new FavoriteRequests()), mounted = useRef(true);
  const favoriteFilter = useRef(favorite);favoriteFilter.current=favorite;
  const searching=query!==search;
  useEffect(() => {mounted.current=true; return () => {mounted.current=false;};}, []);
  useEffect(() => {favorites.current.clear();setFavoritePending(new Set());setFavoriteErrors({});setFacets({muscles: [], equipment: []});setRecentIds(null);setRecentNote("");}, [uid]);
  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(query);
      setCursor(0);
    }, 250);
    return () => clearTimeout(id);
  }, [query]);
  const detail = useRef<HTMLElement>(null);
  useEffect(() => {
    if (selected) detail.current?.scrollIntoView({ block: "start" });
  }, [selected?.id]);
  const params = new URLSearchParams({
    q: search,
    role,
    ...(owned ? { owned: "1" } : {}),
    ...(archived ? { archived: "1" } : {}),
    muscle,
    equipment,
    category,
    cursor: String(cursor),
    ...(favorite ? { favorite: "1" } : {}),
    ...(cameraOnly ? { camera: "1" } : {}),
    ...(demoFilter !== "all" ? {media:demoFilter} : {}),
    ...(recentIds ? { ids: recentIds.join(",") } : {}),
  });
  const result = useGymQuery("/exercises?" + params);
  const filters = new URLSearchParams(params); filters.delete("cursor");
  const filterKey = String(uid) + ":" + filters.toString();
  useEffect(() => {setItems([]);setSelected(null);setEditing(null);setError("");setTotal(0);setNext(null);setReadOnly(false);}, [filterKey]);
  useEffect(() => {
    if (result.data) {
      setFacets({muscles: result.data.muscles || [], equipment: result.data.equipment || []});
      setItems(previous => mergeExercisePage(previous, result.data.items, cursor !== 0, favorites.current)
        .filter(e => !favoriteFilter.current || e.favorite));
      setTotal(result.data.total);setNext(result.data.next ?? null);setReadOnly(!!result.data.__offline);
    }
  }, [result.data]);
  const changeFavorite = async (ex: any, enabled = !ex.favorite) => {
    if (readOnly || result.loading || searching) return;
    const token = localStorage.getItem("token");
    const currentAccount = () => mounted.current && useAuthStore.getState().user?.id === uid && localStorage.getItem("token") === token;
    await favoriteRequests.current.run(`${uid}:${ex.id}`, async () => {
      setFavoritePending(v => new Set(v).add(ex.id));
      setFavoriteErrors(v => {const next={...v};delete next[ex.id];return next;});
      try {
        await request("PUT", "/exercises/" + encodeURIComponent(ex.id) + "/favorite", {enabled}, token);
        if (!currentAccount()) return;
        favorites.current.set(ex.id, enabled);
        setItems(v => v.map(e => e.id===ex.id ? {...e, favorite:enabled} : e).filter(e => !favoriteFilter.current || e.favorite));
        setSelected((v: any) => v?.id===ex.id ? {...v, favorite:enabled} : v);
        if (favoriteFilter.current && !enabled) setTotal(v => Math.max(0,v-1));
      } catch (e) {
        if (currentAccount()) setFavoriteErrors(v => ({...v,[ex.id]:{message:getErrorMessage(e),enabled}}));
      } finally {
        if (currentAccount()) setFavoritePending(v => {const next=new Set(v);next.delete(ex.id);return next;});
      }
    });
  };
  const filter = (setter: (s: string) => void) => (value: string) => {
    setter(value);
    setCursor(0);
  };
  const clearRegion = () => {
    setRegion("");
    filter(setMuscle)("");
  };
  const pickRegion = (key: string, codes: string[]) => {
    if (region === key) clearRegion();
    else {
      setRegion(key);
      filter(setMuscle)(codes.join(","));
    }
  };
  // 货架只是已有筛选状态的快捷入口：收藏与器械直接拨动同一份状态；
  // 「最近用过」从训练记录现算动作 id 集合，走动作库已有的 ids 参数，
  // 不另建一套列表。没有训练记录时只提示，不拨动任何筛选。
  const toggleFavoriteShelf = () => {
    setFavorite(!favorite);
    setCursor(0);
  };
  const toggleBodyweightShelf = () =>
    filter(setEquipment)(equipment === "body weight" ? "" : "body weight");
  const toggleRecentShelf = async () => {
    if (recentIds) {
      setRecentIds(null);
      setCursor(0);
      return;
    }
    if (recentBusy) return;
    setRecentBusy(true);
    setRecentNote("");
    try {
      const data = await request("GET", "/workout-sessions");
      const ids = recentExerciseIds(Array.isArray(data) ? data : []);
      if (!ids.length)
        setRecentNote("还没有训练记录，完成一次训练后，这里会显示最近用过的动作。");
      else {
        setRecentIds(ids);
        setCursor(0);
      }
    } catch (e) {
      setRecentNote("最近记录读取失败：" + getErrorMessage(e));
    } finally {
      setRecentBusy(false);
    }
  };
  const saveCustom = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (readOnly) return;
    const form = new FormData(event.currentTarget);
    try {
      const ex = await request("POST", "/exercises", {
        nameZh: form.get("name"),
        bodyPart: form.get("bodyPart"),
        equipment: form.get("equipment"),
        target: form.get("bodyPart"),
        instructions: String(form.get("steps")).split("\n").filter(Boolean),
        category: form.get("category"),
      });
      setCreating(false);
      setError("");
      result.reload();
      if (onPick) onPick(ex);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };
  return (
    <section className="gym-library">
      <div className="gym-search">
        <label>
          搜索动作
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="名称、器械或动作关键词"
          />
        </label>
        <button className="secondary" disabled={readOnly} onClick={() => setCreating(!creating)}>
          自定义动作
        </button>
      </div>
      <div className="gym-shelves" role="group" aria-label="快捷入口">
        <span>快捷入口</span>
        <button
          type="button"
          className="gym-shelf"
          aria-pressed={favorite}
          onClick={toggleFavoriteShelf}
        >
          我的收藏
        </button>
        <button
          type="button"
          className="gym-shelf"
          aria-pressed={equipment === "body weight"}
          onClick={toggleBodyweightShelf}
        >
          无器械
        </button>
        <button
          type="button"
          className="gym-shelf"
          aria-pressed={!!recentIds}
          disabled={recentBusy}
          onClick={() => void toggleRecentShelf()}
        >
          {recentBusy ? "正在读取记录…" : "最近用过"}
        </button>
      </div>
      {recentNote && (
        <p className="gym-muted" role="status">
          {recentNote}
          <button className="text-btn" onClick={() => setRecentNote("")}>
            关闭
          </button>
        </p>
      )}
      <details
        className="muscle-browser-details"
        open={mapOpen}
        onToggle={(e) => setMapOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary>按部位找动作 · 点人体图选肌群</summary>
        <MuscleBrowser selected={region} onSelect={pickRegion} />
      </details>
      {!!region && (
        <p className="gym-inline-actions">
          <span>
            部位：
            {REGION_LABELS[region] || (region === "lats" ? "背阔肌" : region)}
          </span>
          <button className="secondary" onClick={clearRegion}>
            清除部位筛选
          </button>
        </p>
      )}
      <div className="gym-inline-actions">
        <label>
          动作示范
          <select
            value={demoFilter}
            onChange={(e) => {
              setDemoFilter(e.target.value as MediaFilter);
              setCursor(0);
            }}
          >
            <option value="all">全部动作</option>
            <option value="images">有图片</option>
            <option value="video">有视频</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={cameraOnly}
            onChange={(e) => {
              setCameraOnly(e.target.checked);
              setCursor(0);
            }}
          />
          支持摄像头
        </label>
      </div>
      <details className="media-library-filters">
        <summary>更多筛选 · 肌群、器械、收藏</summary>
        <div className="gym-inline-actions">
          <label>
            <input
              type="checkbox"
              checked={owned}
              onChange={(e) => {
                setOwned(e.target.checked);
                setCursor(0);
              }}
            />
            只用我拥有的器械
          </label>
          <label>
            <input
              type="checkbox"
              checked={archived}
              onChange={(e) => {
                setArchived(e.target.checked);
                setCursor(0);
              }}
            />
            包含已归档动作
          </label>
          <label>
            肌群筛选范围
            <select
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                setCursor(0);
              }}
            >
              <option value="primary">主练肌群</option>
              <option value="all">主练或辅助肌群</option>
            </select>
          </label>
        </div>
        <p className="gym-muted">在“训练设置”配置拥有器械；徒手始终可选。</p>
        <div className="gym-filters">
          <label>
            肌群
            <select
              value={facets.muscles.includes(muscle) ? muscle : ""}
              onChange={(e) => {
                setRegion("");
                filter(setMuscle)(e.target.value);
              }}
            >
              <option value="">全部肌群</option>
              {facets.muscles.map((v: string) => (
                <option key={v} value={v}>
                  {label(v)}
                </option>
              ))}
            </select>
          </label>
          <label>
            器械
            <select
              value={equipment}
              onChange={(e) => filter(setEquipment)(e.target.value)}
            >
              <option value="">全部器械</option>
              {facets.equipment.map((v: string) => (
                <option key={v} value={v}>
                  {label(v)}
                </option>
              ))}
            </select>
          </label>
          <label>
            类型
            <select
              value={category}
              onChange={(e) => filter(setCategory)(e.target.value)}
            >
              <option value="">全部类型</option>
              {["strength", "cardio", "timed"].map((v) => (
                <option key={v} value={v}>
                  {label(v)}
                </option>
              ))}
            </select>
          </label>
          <label className="gym-check">
            <input
              type="checkbox"
              checked={favorite}
              onChange={(e) => {
                setFavorite(e.target.checked);
                setCursor(0);
              }}
            />
            仅收藏
          </label>
        </div>
      </details>
      <CachedDataNotice data={result.data || (readOnly ? {__offline:true} : null)} reload={result.reload} busy={result.loading}/>
      {result.error && cursor === 0 && (
        <div className="gym-error" role="alert">
          动作未加载成功：{result.error}
          <button onClick={result.reload}>重试读取动作</button>
        </div>
      )}
      {error && <div className="gym-error" role="alert">{error}<button onClick={() => setError("")}>关闭提示</button></div>}
      {creating && (
        <form className="gym-form" onSubmit={saveCustom}>
          <h3>创建自己的动作</h3>
          <label>
            动作名
            <input name="name" required maxLength={80} />
          </label>
          <div className="gym-two">
            <label>
              肌群
              <select name="bodyPart">
                {[
                  "chest",
                  "back",
                  "upper legs",
                  "shoulders",
                  "waist",
                  "cardio",
                ].map((v) => (
                  <option key={v} value={v}>
                    {label(v)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              器械
              <input name="equipment" required defaultValue="body weight" />
            </label>
            <label>
              类型
              <select name="category">
                <option value="strength">力量</option>
                <option value="timed">计时</option>
                <option value="cardio">有氧</option>
              </select>
            </label>
          </div>
          <label>
            动作步骤（每行一步）
            <textarea name="steps" required rows={4} />
          </label>
          <button className="primary" disabled={readOnly}>保存动作</button>
        </form>
      )}
      <p className="gym-muted">
        {result.loading || searching
          ? cursor ? `正在加载更多 · 已显示 ${items.length} 个动作` : "正在读取动作…"
          : result.error && cursor === 0 ? "动作数量尚未读取，请重试。"
          : `${total} 个动作 · 带摄像头标记的可以对着镜头练，新动作的识别还在试用`}
      </p>
      {selected && (
        <article className="gym-exercise-detail" ref={detail}>
          <button className="text-btn" onClick={() => setSelected(null)}>
            收起详情
          </button>
          <h3>{selected.nameZh}</h3>
          <button className="secondary" aria-pressed={!!selected.favorite} disabled={readOnly || result.loading || favoritePending.has(selected.id)} onClick={() => void changeFavorite(selected)}>
            {favoritePending.has(selected.id) ? "正在保存收藏…" : selected.favorite ? "取消收藏" : "收藏动作"}
          </button>
          <p className="gym-muted">{selected.name}</p>
          <ExerciseMediaPanel key={selected.id} exercise={selected} layout="detail" />
          <p className="exercise-media-badges detail-tags" aria-label="器械与目标肌群">
            <span>器械 · {label(selected.equipment)}</span>
            <span>目标 · {label(selected.target)}</span>
            {selected.secondaryMuscles.map((m: string) => (
              <span key={m} className="pending">协同 · {label(m)}</span>
            ))}
            <span className="pending">部位 · {label(selected.bodyPart)}</span>
          </p>
          <h4>{selected.reviewStatus==='needs_review'?'来源步骤（待核对）':'动作步骤'}</h4>
          <ol>
            {selected.instructions.map((s: string, i: number) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          <p>不适时停止；示范及文字不代表专业教学认证。</p>
          {selected.form && (
            <p className="media-note">
              <strong>适用形式：</strong>
              {selected.form}
            </p>
          )}
          {!!selected.cues?.length && (
            <div className="media-note">
              <strong>主要注意点</strong>
              <ul>
                {selected.cues.map((cue: string, i: number) => (
                  <li key={i}>{cue}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="gym-muted">
            来源：{selected.provenance?.source || "本人自定义／动伴原创"} ·{" "}
            {selected.provenance?.license || "原创文字"}
            ；示范素材独立核验，来源见上方许可清单。
          </p>
          <CameraCapability exercise={selected} />
          {selected.id.startsWith("user:") && (
            <div className="gym-inline-actions">
              <button disabled={readOnly} onClick={() => setEditing(structuredClone(selected))}>
                编辑自定义动作
              </button>
              <button
                disabled={readOnly}
                onClick={async () => {
                  try {
                    await request(
                      "PUT",
                      "/exercises/" + encodeURIComponent(selected.id),
                      { archived: !selected.archived },
                    );
                    setSelected(null);
                    result.reload();
                  } catch (e) {
                    setError(getErrorMessage(e));
                  }
                }}
              >
                {selected.archived ? "恢复归档" : "归档（保留历史）"}
              </button>
            </div>
          )}
          {editing && (
            <form
              className="gym-form"
              onSubmit={async (e) => {
                e.preventDefault();
                if (readOnly) return;
                try {
                  const next = await request(
                    "PUT",
                    "/exercises/" + encodeURIComponent(editing.id),
                    {
                      nameZh: editing.nameZh,
                      instructions: editing.instructions,
                      bodyPart: editing.bodyPart,
                      equipment: editing.equipment,
                      target: editing.target,
                      secondaryMuscles: editing.secondaryMuscles,
                    },
                  );
                  setSelected(next);
                  setEditing(null);
                  result.reload();
                } catch (e) {
                  setError(getErrorMessage(e));
                }
              }}
            >
              <label>
                名称
                <input
                  value={editing.nameZh}
                  maxLength={80}
                  onChange={(e) =>
                    setEditing({ ...editing, nameZh: e.target.value })
                  }
                />
              </label>
              <label>
                主练肌群
                <input
                  value={editing.target}
                  onChange={(e) =>
                    setEditing({ ...editing, target: e.target.value })
                  }
                />
              </label>
              <label>
                辅助肌群（逗号分隔）
                <input
                  value={editing.secondaryMuscles.join(",")}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      secondaryMuscles: e.target.value
                        .split(",")
                        .filter(Boolean),
                    })
                  }
                />
              </label>
              <label>
                器械
                <input
                  value={editing.equipment}
                  onChange={(e) =>
                    setEditing({ ...editing, equipment: e.target.value })
                  }
                />
              </label>
              <label>
                步骤
                <textarea
                  rows={4}
                  value={editing.instructions.join("\n")}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      instructions: e.target.value.split("\n"),
                    })
                  }
                />
              </label>
              <button className="primary" disabled={readOnly}>保存修改</button>
              <button type="button" onClick={() => setEditing(null)}>
                取消
              </button>
            </form>
          )}
          {onPick && (
            <button className="primary" disabled={searching || result.loading} onClick={() => onPick(selected)}>
              加入这个动作
            </button>
          )}
        </article>
      )}
      <div className="gym-exercise-list">
        {(cursor === 0 && (result.loading || result.error) ? [] : items).map((ex) => (
          <article key={ex.id}>
            <button
              className="gym-exercise-name"
              disabled={searching || result.loading}
              onClick={() => setSelected(ex)}
            >
              <ExerciseThumb exercise={ex} />
              <span className="exercise-list-copy">
                <b>{ex.nameZh}</b>
                <small>
                  {label(ex.bodyPart)} · {label(ex.equipment)}
                  {ex.planCamera
                    ? " · 摄像头试用"
                    : ex.cameraType
                      ? " · 摄像头"
                      : ""}
                  {ex.archived ? " · 已归档" : ""}
                </small>
                <span className="exercise-media-badges">
                  {mediaSummaryFor(ex.id)?.images ? <span>{mediaSummaryFor(ex.id)?.kind==='illustration'?'原创图解':'真人图片'}</span> : null}
                  {mediaSummaryFor(ex.id)?.video && <span>连续视频</span>}
                  {(ex.planCamera || ex.cameraType) && (
                    <span>摄像头{ex.planCamera ? "试用" : ""}</span>
                  )}
                  {!mediaSummaryFor(ex.id) && (
                    <span className="pending">{ex.reviewStatus==='needs_review'?'资料待核对':'示范待补'}</span>
                  )}
                </span>
              </span>
            </button>
            <button
              className="gym-favorite"
              aria-label={
                ex.favorite ? "取消收藏" + ex.nameZh : "收藏" + ex.nameZh
              }
              aria-pressed={ex.favorite}
              aria-busy={favoritePending.has(ex.id)}
              disabled={readOnly || searching || result.loading || favoritePending.has(ex.id)}
              onClick={() => void changeFavorite(ex)}
            >
              <Icon name="heart" weight={ex.favorite ? "fill" : "regular"} />
            </button>
            {onPick && (
              <button className="secondary" disabled={searching || result.loading} onClick={() => onPick(ex)}>
                加入
              </button>
            )}
            {favoriteErrors[ex.id] && <div className="gym-favorite-error" role="alert">
              收藏未保存：{favoriteErrors[ex.id].message}
              <button disabled={readOnly || favoritePending.has(ex.id)} onClick={() => void changeFavorite(ex, favoriteErrors[ex.id].enabled)}>重试收藏操作</button>
            </div>}
          </article>
        ))}
      </div>
      {!result.loading && !result.error && !items.length && (
        <p className="gym-empty">没有匹配动作，试试更少的筛选条件。</p>
      )}
      {result.error && cursor > 0 && <div className="gym-error" role="alert">
        加载更多失败，已显示的动作和筛选已保留：{result.error}
        <button disabled={result.loading} onClick={result.reload}>重试加载更多</button>
      </div>}
      {next != null && !(result.error && cursor > 0) && (
        <button
          className="secondary gym-load-more"
          disabled={result.loading}
          onClick={() => setCursor(next!)}
        >
          加载更多
        </button>
      )}
    </section>
  );
}
export default function Library() {
  const navigate = useNavigate();
  return (
    <div className="page gym-page">
      <Header title="动作库" back={() => navigate("/train/plans")} />
      <ExerciseLibrary />
    </div>
  );
}
