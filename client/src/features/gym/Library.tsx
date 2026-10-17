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
    [owned, setOwned] = useState(false),
    [archived, setArchived] = useState(false),
    [role, setRole] = useState("primary"),
    [editing, setEditing] = useState<any>(null),
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
    role,
    ...(owned ? { owned: "1" } : {}),
    ...(archived ? { archived: "1" } : {}),
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
          <p>
            主练：{label(selected.target)} · 辅助：
            {selected.secondaryMuscles.map(label).join("、") || "未标注"}
          </p>
          <p className="gym-muted">
            来源：{selected.provenance?.source || "本人自定义／动伴原创"} ·{" "}
            {selected.provenance?.license || "原创文字"}
            ；保留原文名称，不包含上游媒体。
          </p>
          {selected.id.startsWith("user:") && (
            <div className="gym-inline-actions">
              <button onClick={() => setEditing(structuredClone(selected))}>
                编辑自定义动作
              </button>
              <button
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
              <button className="primary">保存修改</button>
              <button type="button" onClick={() => setEditing(null)}>
                取消
              </button>
            </form>
          )}
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
                {ex.archived ? " · 已归档" : ""}
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
