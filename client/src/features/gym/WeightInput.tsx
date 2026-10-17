import { useEffect, useState } from "react";
import { canonicalWeight, displayWeight } from "./trainingMath";
export function WeightInput({
  kg,
  unit = "kg",
  onChange,
  label = "外部负重",
}: {
  kg: number;
  unit?: string;
  onChange: (kg: number) => void;
  label?: string;
}) {
  const [text, setText] = useState(String(displayWeight(kg, unit)));
  useEffect(() => setText(String(displayWeight(kg, unit))), [kg, unit]);
  return (
    <label>
      {label} {unit}
      <input
        type="number"
        min="0"
        max={unit === "lb" ? 2204.6227 : 1000}
        step="any"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          if (Number.isFinite(n) && n >= 0) onChange(canonicalWeight(n, unit));
        }}
      />
    </label>
  );
}
