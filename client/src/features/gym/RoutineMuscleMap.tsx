import paths from "./muscle-paths.json";
import { litMuscleRegions } from "./routineMuscles";

// 计划／日程卡片上的迷你肌群图：把该训练日各动作的主练肌群在正反两面
// 人体图上点亮（与动作详情页的人体图同一套路径与配色）。没有任何可
// 点亮的区域时不渲染——例如该训练日只有背阔肌动作，而源图没有背阔肌
// 轮廓——不拿空图或臆造轮廓充数。
export function RoutineMuscleMap({
  exercises,
}: {
  exercises: Array<{ target?: string | null } | null | undefined>;
}) {
  const lit = new Set(litMuscleRegions(exercises));
  if (!lit.size) return null;
  return (
    <div className="routine-muscles" aria-label="本次训练主练肌群示意">
      {(["front", "back"] as const).map((side) => (
        <svg
          key={side}
          viewBox={side === "front" ? "0 95 727 1280" : "718 95 727 1280"}
          aria-hidden="true"
        >
          {paths[side].map((muscle, i) => (
            <g key={i}>
              {muscle.paths.map((path, j) => (
                <path
                  key={j}
                  d={path}
                  fill={lit.has(muscle.muscle) ? "#008b43" : "#e5ece8"}
                  stroke="#fff"
                  strokeWidth="3"
                />
              ))}
            </g>
          ))}
        </svg>
      ))}
    </div>
  );
}
