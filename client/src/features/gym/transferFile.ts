export async function sha(value: any) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
function csv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw Error("CSV引号没有闭合");
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
export function chunkFile(text: string, format: string, unit = "kg") {
  if (text.length > 20000000) throw Error("文件超过20MB，请拆分后再导入");
  let root: any,
    actualFormat = format;
  if (["strong", "hevy", "fitnotes"].includes(format)) {
    const [header, ...rows] = csv(text.replace(/^\uFEFF/, ""));
    if (!header) throw Error("CSV为空");
    const keys = header.map((h) => h.trim().toLowerCase().replace(/[ _]/g, "")),
      get = (row: string[], ...names: string[]) => {
        for (const name of names) {
          const i = keys.indexOf(name);
          if (i >= 0 && row[i]) return row[i];
        }
        return "";
      };
    const workouts = new Map<string, any>();
    for (const row of rows) {
      const raw = get(row, "date", "starttime").replace(/\//g, "-"),
        date = new Date(raw);
      if (!Number.isFinite(date.getTime()))
        throw Error("CSV日期无法识别，请转换为ISO日期");
      const name = get(row, "workoutname", "title") || "导入训练",
        key = date.toISOString() + "|" + name;
      if (!workouts.has(key))
        workouts.set(key, { name, createdAt: date.toISOString(), sets: [] });
      const exercise = get(row, "exercisename", "exercisetitle", "exercise");
      if (!exercise) throw Error("CSV缺少动作名称");
      const seconds = get(row, "seconds", "durationseconds"),
        time = get(row, "time");
      workouts
        .get(key)
        .sets.push({
          name: exercise,
          reps: Number(get(row, "reps") || 0),
          loadKg:
            Number(get(row, "weightkg", "weight") || 0) *
            (unit === "lb" && !keys.includes("weightkg") ? 0.45359237 : 1),
          seconds: seconds
            ? Number(seconds)
            : /^[\d:.]+$/.test(time)
              ? time.split(":").reduce((n, v) => n * 60 + Number(v), 0)
              : 0,
          kind:
            get(row, "settype") === "warmup"
              ? "warmup"
              : get(row, "settype") === "dropset"
                ? "drop"
                : "work",
        });
    }
    root = {
      format: "movemate-gym",
      version: 2,
      workouts: [...workouts.values()],
    };
    actualFormat = "movemate";
  } else {
    const parsed = JSON.parse(text);
    root = parsed.state || parsed.S || parsed;
  }
  if (!root || typeof root !== "object" || Array.isArray(root))
    throw Error("请选择完整训练数据 JSON");
  const base =
    actualFormat === "movemate"
      ? { format: "movemate-gym", version: root.version || 2 }
      : { unit: root.unit || "kg" };
  const parts: any[] = [],
    groups: [string, any[]][] = [
      ["customExercises", root.customExercises || []],
      ["plans", root.plans || root.routines || []],
      ["workouts", root.workouts || []],
      [
        "bodyWeights",
        root.body?.items ||
          root.bodyWeights ||
          root.bodyweights ||
          root.weighIns ||
          root.weights ||
          [],
      ],
    ];
  for (const [key, items] of groups) {
    if (!Array.isArray(items)) throw Error(key + " 的格式无法识别");
    let values: any[] = [];
    for (const item of items) {
      if (key === "workouts" && item.phase && item.phase !== "finished")
        continue;
      const test = { ...base, [key]: [...values, item] };
      if (JSON.stringify(test).length > 280000 || values.length >= 80) {
        if (!values.length) throw Error("一条记录超过280KB，请先拆分这条记录");
        parts.push({ ...base, [key]: values });
        values = [];
      }
      values.push(item);
    }
    if (values.length) parts.push({ ...base, [key]: values });
  }
  if (root.settings || root.body?.settings)
    parts.push({ ...base, settings: root.settings || root.body.settings });
  if (!parts.length) throw Error("文件中没有可识别的计划、完成历史或身体记录");
  if (parts.length > 10000) throw Error("分批数量过多，请拆分文件");
  return { parts, format: actualFormat };
}
