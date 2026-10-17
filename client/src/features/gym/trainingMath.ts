export const KG_PER_LB = 0.45359237;
export const displayWeight = (kg: number, unit = "kg") =>
  Number((kg / (unit === "lb" ? KG_PER_LB : 1)).toFixed(3));
export const canonicalWeight = (value: number, unit = "kg") =>
  value * (unit === "lb" ? KG_PER_LB : 1);
/** Bounded integer dynamic programming, with paired plates only. Canonical inputs are kg. */
export function plateLoading(
  targetKg: number,
  barKg: number,
  plates: { kg: number; count: number }[],
) {
  if (
    !Number.isFinite(targetKg) ||
    !Number.isFinite(barKg) ||
    targetKg < 0 ||
    targetKg > 1000 ||
    barKg < 0 ||
    barKg > 100
  )
    throw Error("重量超出范围");
  if (targetKg < barKg)
    return {
      sides: [],
      actualKg: barKg,
      differenceKg: targetKg - barKg,
      belowBar: true,
    };
  const target = Math.floor((targetKg - barKg) * 500 + 1e-7),
    reach = new Uint8Array(target + 1);
  reach[0] = 1;
  const previous = new Int32Array(target + 1).fill(-1),
    choice = new Int32Array(target + 1).fill(-1),
    bundles: { index: number; count: number; grams: number }[] = [];
  plates.forEach((p, index) => {
    if (
      !(
        p.kg > 0 &&
        p.kg <= 100 &&
        Number.isInteger(p.count) &&
        p.count >= 0 &&
        p.count <= 100
      )
    )
      throw Error("杠铃片配置无效");
    let remaining = Math.floor(p.count / 2);
    for (let size = 1; remaining > 0; size *= 2) {
      const count = Math.min(size, remaining);
      remaining -= count;
      bundles.push({ index, count, grams: Math.round(p.kg * 1000) * count });
    }
  });
  // Immutable predecessor nodes prevent reusing the same bounded bundle during reconstruction.
  const nodes: { prev: number; bundle: number }[] = [{ prev: -1, bundle: -1 }],
    nodeAt = new Int32Array(target + 1);
  bundles.forEach((bundle, index) => {
    for (let v = target; v >= bundle.grams; v--)
      if (!reach[v] && reach[v - bundle.grams]) {
        reach[v] = 1;
        previous[v] = v - bundle.grams;
        choice[v] = index;
        nodes.push({ prev: nodeAt[v - bundle.grams], bundle: index });
        nodeAt[v] = nodes.length - 1;
      }
  });
  let best = target;
  while (best > 0 && !reach[best]) best--;
  const counts = new Map<number, number>();
  let n = nodeAt[best];
  while (n > 0) {
    const b = bundles[nodes[n].bundle];
    counts.set(b.index, (counts.get(b.index) || 0) + b.count);
    n = nodes[n].prev;
  }
  const actualKg = barKg + (best * 2) / 1000;
  return {
    sides: [...counts]
      .map(([i, count]) => ({ kg: plates[i].kg, count }))
      .sort((a, b) => b.kg - a.kg),
    actualKg,
    differenceKg: Number((targetKg - actualKg).toFixed(6)),
    belowBar: false,
  };
}
