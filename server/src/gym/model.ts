import { z } from "zod";
import catalogue from "./catalog.json";
import zhTerms from "./zh-terms.json";
import { planCameraFor } from "./camera";
import { documented } from './documentation';
export const cameraKeys = [
  "squat",
  "jumping_jack",
  "high_knees",
  "push_up",
] as const;
export type Exercise = {
  id: string;
  name: string;
  nameZh: string;
  bodyPart: string;
  equipment: string;
  target: string;
  secondaryMuscles: string[];
  instructions: string[];
  category: string;
  cameraType?: (typeof cameraKeys)[number];
  planCamera?: ReturnType<typeof planCameraFor>;
  cues?: string[];
  form?: string;
  reviewStatus?: 'checked'|'needs_review';
  reviewReason?: string;
};
const core = [
  [
    "squat",
    "徒手深蹲",
    "upper legs",
    "quadriceps",
    "全身入镜，略侧身；站立、下蹲，再回到站立算一次。",
  ],
  [
    "jumping_jack",
    "开合跳",
    "cardio",
    "full body",
    "正面全身入镜；手脚展开后合拢算一次。",
  ],
  [
    "high_knees",
    "高抬腿",
    "upper legs",
    "quadriceps",
    "正面全身入镜；左右各完成抬腿并落下算一对。",
  ],
  [
    "push_up",
    "俯卧撑",
    "chest",
    "pectorals",
    "侧身入镜；伸臂支撑、屈肘下降，再推起算一次。",
  ],
];
const names: Record<string, string> = {
  "sit-up": "仰卧起坐",
  "sit up": "仰卧起坐",
  crunch: "卷腹",
  "russian twist": "俄罗斯转体",
  "leg raise": "举腿",
  "heel touchers": "触踵",
  "side bend": "侧屈",
  "calf raise": "提踵",
  "hip thrust": "臀推",
  "glute bridge": "臀桥",
  "glute kickback": "臀部后踢",
  "leg press": "腿举",
  "leg extension": "腿屈伸",
  "leg curl": "腿弯举",
  "chest fly": "胸部飞鸟",
  "reverse fly": "反向飞鸟",
  "triceps pushdown": "三头下压",
  "pull-down": "下拉",
  pulldown: "下拉",
  "pull-over": "直臂上拉",
  pullover: "直臂上拉",
  shrug: "耸肩",
  "hammer curl": "锤式弯举",
  "preacher curl": "牧师凳弯举",
  "concentration curl": "集中弯举",
  "front raise": "前平举",
  "upright row": "直立划船",
  row: "划船",
  dip: "臂屈伸",
  "jump rope": "跳绳",
  jump: "跳跃",
  running: "跑步",
  walking: "步行",
  cycling: "骑行",
  stretch: "拉伸",
  hip: "髋部",
  adduction: "内收",
  abduction: "外展",
  rotation: "旋转",
  curl: "弯举",
  kneeling: "跪姿",
  assisted: "辅助",
  weighted: "负重",
  "single arm": "单臂",

  barbell: "杠铃",
  dumbbell: "哑铃",
  cable: "绳索",
  "body weight": "徒手",
  band: "弹力带",
  smith: "史密斯",
  "bench press": "卧推",
  deadlift: "硬拉",
  squat: "深蹲",
  lunge: "弓步蹲",
  "pull-up": "引体向上",
  "pull up": "引体向上",
  "push-up": "俯卧撑",
  "push up": "俯卧撑",
  "shoulder press": "肩推",
  "biceps curl": "二头弯举",
  "triceps extension": "三头伸展",
  "lateral raise": "侧平举",
  "lat pulldown": "高位下拉",
  "bent over row": "俯身划船",
  "seated row": "坐姿划船",
  plank: "平板支撑",
  standing: "站姿",
  seated: "坐姿",
  incline: "上斜",
  decline: "下斜",
  "one arm": "单臂",
  "two arm": "双臂",
  "single leg": "单腿",
  lying: "仰卧",
  reverse: "反向",
  "wide grip": "宽握",
  "close grip": "窄握",
  "back lever": "后水平支撑",
  "front lever": "前水平支撑",
  "side lying": "侧卧",
  "side-lying": "侧卧",
  "reverse grip": "反握",
  "underhand grip": "反握",
  "overhand grip": "正握",
  "neutral grip": "中立握",
};
export function chineseName(name: string) {
  const phrases = Object.keys(names)
    .sort((a, b) => b.length - a.length)
    .map((phrase) => phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return name.replace(
    new RegExp("\\b(?:" + phrases.join("|") + ")\\b", "gi"),
    (match) => names[match.toLowerCase()],
  );
}
export const exercises: Exercise[] = [
  ...core.map(([id, nameZh, bodyPart, target, instruction]) => ({
    id: "motion:" + id,
    name: id,
    nameZh,
    bodyPart,
    target,
    equipment: "body weight",
    secondaryMuscles: [],
    instructions: [instruction],
    category: "strength",
    cameraType: id as (typeof cameraKeys)[number],
  })),
  ...(catalogue as any[]).map((e) => ({
    ...e,
    planCamera: planCameraFor(e.id),
    nameZh:
      e.nameZh ||
      chineseName(e.name).replace(
        /[a-z]+/gi,
        (word: string) =>
          (zhTerms as Record<string, string>)[word.toLowerCase()] || word,
      ),
    aliases: [
      ...(e.aliases || []),
      ...(e.nameZh ? [e.nameZh] : []),
      e.name,
      chineseName(e.name),
      e.target,
      e.equipment,
      ...[
        ["row", "划船"],
        ["curl", "弯举"],
        ["squat", "深蹲"],
        ["bench press", "卧推"],
        ["deadlift", "硬拉"],
        ["lunge", "弓步蹲"],
        ["pulldown", "下拉"],
        ["fly", "飞鸟"],
      ]
        .filter(([word]) => e.name.includes(word))
        .map(([, zh]) => chineseName(e.equipment) + zh),
    ],
    provenance: {
      source: "exercises-dataset",
      revision: "7455efae41b330c265e7cd4b78dfa848e7ce5ebd",
      license: "MIT",
      translation: "MoveMate 独立术语翻译",
    },
    category:
      e.bodyPart === "cardio"
        ? "cardio"
        : /plank|hold|hang/i.test(e.name)
          ? "timed"
          : "strength",
    instructions: Array.isArray(e.instructions)
      ? e.instructions
      : [String(e.instructions)],
  })),
  { id: "movemate:reverse_lunge", name: "alternating reverse lunge", nameZh: "交替后撤弓步", bodyPart: "upper legs", equipment: "body weight", target: "quadriceps", secondaryMuscles: ["glutes", "hamstrings"], category: "strength", instructions: ["双脚并立，保持身体直立。", "一侧向后撤步并屈膝下沉，保持前脚支撑。", "返回并脚站立，再换另一侧；每侧完成计一次。"], planCamera: planCameraFor("movemate:reverse_lunge") },
].map(documented);
export const setSchema = z.object({
  kind: z.enum(["warmup", "work", "drop", "rest_pause"]).default("work"),
  reps: z.number().int().min(1).max(500).default(10),
  seconds: z.number().int().min(0).max(7200).default(0),
  loadKg: z.number().min(0).max(1000).default(0),
  restSec: z.number().int().min(0).max(900).default(90),
  side: z.enum(["both", "each", "left", "right"]).default("both"),
  superset: z.string().max(20).default(""),
});
export const progressionSchema = z.object({
  mode: z.enum(["off", "linear", "double", "triple", "time"]).default("off"),
  incrementKg: z.number().min(0.25).max(20).default(2.5),
  minReps: z.number().int().min(1).max(500).default(8),
  maxReps: z.number().int().min(1).max(500).default(12),
  maxSets: z.number().int().min(1).max(20).default(5),
  incrementSeconds: z.number().int().min(1).max(300).default(5),
});
export const planSchema = z.object({
  name: z.string().trim().min(1).max(80),
  mode: z.enum(["weekly", "rotation"]).default("weekly"),
  rotationCursor: z.number().int().min(0).default(0),
  routines: z
    .array(
      z.object({
        id: z.string().min(1).max(80),
        name: z.string().trim().min(1).max(80),
        weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
        exercises: z
          .array(
            z.object({
              exerciseId: z.string().min(1).max(100),
              progression: progressionSchema.optional(),
              sets: z.array(setSchema).min(1).max(20),
            }),
          )
          .min(1)
          .max(30),
      }),
    )
    .min(1)
    .max(14),
  progression: progressionSchema.default({ mode: "off" }),
});
export type Plan = z.infer<typeof planSchema>;
export const json = <T = any>(value: string, fallback: T = {} as T): T => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};
const find = (name: string, fallback: string) =>
  exercises.find((e) => e.name.toLowerCase() === name)?.id || fallback;
const routine = (
  id: string,
  name: string,
  weekdays: number[],
  ids: string[],
  count = 3,
  reps = 10,
) => ({
  id,
  name,
  weekdays,
  exercises: ids.map((exerciseId) => ({
    exerciseId,
    sets: Array.from({ length: count }, () =>
      setSchema.parse({ reps, seconds: exerciseId.includes("plank") ? 30 : 0 }),
    ),
  })),
});
export function templates() {
  const squat = "motion:squat",
    push = "motion:push_up",
    row = find("dumbbell bent over row", push),
    bench = find("barbell bench press", push),
    dead = find("barbell deadlift", squat),
    press = find("dumbbell shoulder press", push);
  return [
    {
      key: "full",
      ...planSchema.parse({
        name: "全身训练",
        routines: [routine("a", "全身 A", [1, 3, 5], [squat, push, row])],
      }),
    },
    {
      key: "upper_lower",
      ...planSchema.parse({
        name: "上下肢训练",
        routines: [
          routine("upper", "上肢", [1, 4], [bench, row, press]),
          routine("lower", "下肢", [2, 5], [squat, dead]),
        ],
      }),
    },
    {
      key: "ppl",
      ...planSchema.parse({
        name: "推拉腿",
        mode: "rotation",
        routines: [
          routine("push", "推", [], [bench, press]),
          routine("pull", "拉", [], [row, dead]),
          routine("legs", "腿", [], [squat, "motion:high_knees"]),
        ],
      }),
    },
    {
      key: "5x5",
      ...planSchema.parse({
        name: "5×5 基础计划",
        routines: [
          routine("a", "力量 A", [1, 5], [squat, bench, row], 5, 5),
          routine("b", "力量 B", [3], [squat, press, dead], 5, 5),
        ],
      }),
    },
  ];
}
