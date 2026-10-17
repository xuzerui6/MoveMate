import { useEffect, useState } from "react";
import { Header } from "../motion/components/Header";
import { Icon } from "../motion/components/Icons";
import { useNavigate } from "react-router-dom";
import { label, request, useGymQuery, getErrorMessage } from "./api";
export function ExerciseLibrary({
  onPick,
}: {
  onPick?: (exercise: any) => void;
}) {
  const [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [muscle, setMuscle] = useState(
      new URLSearchParams(location.search).get("muscle") || "",
    ),
    [equipment, setEquipment] = useState(""),
    [category, setCategory] = useState(""),
    [favorite, setFavorite] = useState(false),
    [cursor, setCursor] = useState(0),
    [items, setItems] = useState<any[]>([]),
    [selected, setSelected] = useState<any>(null),
    [creating, setCreating] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(query);
      setCursor(0);
    }, 250);
    return () => clearTimeout(id);
  }, [query]);
  const params = new URLSearchParams({
    q: search,
    muscle,
    equipment,
    category,
    cursor: String(cursor),
    ...(favorite ? { favorite: "1" } : {}),
  });
  const result = useGymQuery("/exercises?" + params);
  useEffect(() => {
    if (result.data)
      setItems((previous) =>
        cursor
          ? Array.from(
              new Map(
                [...previous, ...result.data.items].map((e) => [e.id, e]),
              ).values(),
            )
          : result.data.items,
      );
  }, [result.data]);
  const filter = (setter: (s: string) => void) => (value: string) => {
    setter(value);
    setCursor(0);
  };
  const saveCustom = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
        <button className="secondary" onClick={() => setCreating(!creating)}>
          自定义动作
        </button>
      </div>
      <div className="gym-filters">
        <label>
          肌群
          <select
            value={muscle}
            onChange={(e) => filter(setMuscle)(e.target.value)}
          >
            <option value="">全部肌群</option>
            {result.data?.muscles.map((v: string) => (
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
            {result.data?.equipment.map((v: string) => (
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
      {(result.error || error) && (
        <div className="gym-error" role="alert">
          {result.error || error}
          <button onClick={result.reload}>重试</button>
        </div>
      )}
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
          <button className="primary">保存动作</button>
        </form>
      )}
      <p className="gym-muted">
        {result.loading
          ? "正在读取动作…"
          : `${result.data?.total || 0} 个匹配动作 · 仅四种指定徒手动作支持摄像头`}
      </p>
      {selected && (
        <article className="gym-exercise-detail">
          <button className="text-btn" onClick={() => setSelected(null)}>
            收起详情
          </button>
          <h3>{selected.nameZh}</h3>
          <p className="gym-muted">
            {selected.name} · {label(selected.equipment)} ·{" "}
            {label(selected.bodyPart)}
          </p>
          <ol>
            {selected.instructions.map((s: string, i: number) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          <p>
            从舒适负重开始；不适时停止。
            {selected.cameraType
              ? "支持本地摄像头自动记组。"
              : "本动作使用手动记录。"}
          </p>
          {onPick && (
            <button className="primary" onClick={() => onPick(selected)}>
              加入这个动作
            </button>
          )}
        </article>
      )}
      <div className="gym-exercise-list">
        {items.map((ex) => (
          <article key={ex.id}>
            <button
              className="gym-exercise-name"
              onClick={() => setSelected(ex)}
            >
              <b>{ex.nameZh}</b>
              <small>
                {label(ex.bodyPart)} · {label(ex.equipment)}
                {ex.cameraType ? " · 摄像头" : ""}
              </small>
            </button>
            <button
              className="gym-favorite"
              aria-label={
                ex.favorite ? "取消收藏" + ex.nameZh : "收藏" + ex.nameZh
              }
              aria-pressed={ex.favorite}
              onClick={() => {
                void request(
                  "PUT",
                  "/exercises/" + encodeURIComponent(ex.id) + "/favorite",
                  { enabled: !ex.favorite },
                )
                  .then(() => result.reload())
                  .catch((e) => setError(getErrorMessage(e)));
              }}
            >
              <Icon name="heart" weight={ex.favorite ? "fill" : "regular"} />
            </button>
            {onPick && (
              <button className="secondary" onClick={() => onPick(ex)}>
                加入
              </button>
            )}
          </article>
        ))}
      </div>
      {!result.loading && !items.length && (
        <p className="gym-empty">没有匹配动作，试试更少的筛选条件。</p>
      )}
      {result.data?.next != null && (
        <button
          className="secondary gym-load-more"
          disabled={result.loading}
          onClick={() => setCursor(result.data.next)}
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
