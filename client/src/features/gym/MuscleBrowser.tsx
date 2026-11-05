import paths from "./muscle-paths.json";
import { OUTLINELESS_FILTERS, REGION_LABELS, regionFilterCodes } from "./media";
import "./exercise-media.css";

// 按部位找动作：点人体图上的肌群区域 → 按该肌群筛选动作库。
// 区域与筛选代码的对应由 media.ts 的 muscleGroups 反演，与动作详情页的
// 肌群着色口径一致；源图没有独立轮廓的肌群（背阔肌）用按钮补位并注明。
export function MuscleBrowser({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (key: string, codes: string[]) => void;
}) {
  const pick = (key: string, codes: string[]) => {
    if (codes.length) onSelect(key, codes);
  };
  return (
    <div className="muscle-browser">
      <div className="exercise-muscle-pair">
        {(["front", "back"] as const).map((side) => (
          <svg
            key={side}
            viewBox={side === "front" ? "0 95 727 1280" : "718 95 727 1280"}
            role="group"
            aria-label={side === "front" ? "正面肌群，点区域筛选" : "背面肌群，点区域筛选"}
          >
            {(paths as any)[side].map((m: any, i: number) => {
              const codes = regionFilterCodes(m.muscle);
              const active = selected === m.muscle;
              const interactive = codes.length > 0;
              return (
                <g
                  key={i}
                  {...(interactive
                    ? {
                        role: "button",
                        tabIndex: 0,
                        "aria-pressed": active,
                        onClick: () => pick(m.muscle, codes),
                        onKeyDown: (ev: React.KeyboardEvent) => {
                          if (ev.key === "Enter" || ev.key === " ") {
                            ev.preventDefault();
                            pick(m.muscle, codes);
                          }
                        },
                        style: { cursor: "pointer" },
                      }
                    : {})}
                >
                  <title>
                    {interactive
                      ? `按${REGION_LABELS[m.muscle] || m.muscle}筛选`
                      : REGION_LABELS[m.muscle] || m.muscle}
                  </title>
                  {m.paths.map((p: string, j: number) => (
                    <path
                      key={j}
                      d={p}
                      fill={
                        active ? "#008b43" : interactive ? "#cfe6d6" : "#e5ece8"
                      }
                      stroke="#fff"
                      strokeWidth="3"
                    />
                  ))}
                </g>
              );
            })}
          </svg>
        ))}
      </div>
      <div className="muscle-browser-extra">
        <span className="gym-muted">图上没有独立轮廓的肌群：</span>
        {OUTLINELESS_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={selected === f.key ? "primary" : "secondary"}
            aria-pressed={selected === f.key}
            onClick={() => pick(f.key, f.codes)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <small className="gym-muted">
        点任意着色区域按该肌群筛选，再点一次取消。图形来自{" "}
        <a href="/licenses/MuscleMap-MIT.txt" target="_blank" rel="noreferrer">
          MuscleMap · MIT
        </a>
        。
      </small>
    </div>
  );
}
