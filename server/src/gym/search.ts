import pinyinTable from "./pinyin-table.json";
import mediaCatalogue from "./media-index.json";
import type { Exercise } from "./model";

// 动作库搜索升级（2026-11-05）：在原有子串匹配之上增加
// 1) 拼音全拼/首字母（shendun、sd 都能找到深蹲）；
// 2) 俗称词表（虐腹→卷腹、龙门架→绳索 等正式名里不出现的叫法）；
// 3) 肌群/器械中文标签通道（练背、二头、泡沫轴 按部位找动作）；
// 4) 相关性排序：名称命中 > 别名/拼音 > 部位标签 > 说明提及，
//    有完整示范、已收藏的同分优先。
// 原有匹配一条不丢：旧逻辑命中的条目在新逻辑里必然有分，只是名次可能变化。
// 拉丁短词（≤3 字母）防噪：英文名/说明只认整词相等、词首或整词命中，
// 避免 sd 命中 palms down、hands down 这类跨词巧合子串。

type MediaCapability = { images: number; video: boolean };
const mediaIndex = mediaCatalogue as Record<string, MediaCapability>;

export const normalizeQuery = (value: string) =>
  value.toLowerCase().trim().replace(/[\s\-_'·.,，。、]/g, "");

const hasChinese = (s: string) => /[一-鿿]/.test(s);

// 俗称 → 正式名关键词。只收录「俗称本身不是任何正式名子串」的对子
// （已逐条对目录核对）；扩展词命中名称/别名按别名档计分。
export const SYNONYMS: Record<string, string[]> = {
  虐腹: ["卷腹", "仰卧起坐"],
  箭步: ["弓步"],
  硬举: ["硬拉"],
  龙门架: ["绳索"],
  拉力器: ["绳索"],
  单杠: ["引体向上"],
  推肩: ["推举"],
  杰克跳: ["开合跳"],
  静蹲: ["靠墙"],
  rdl: ["romanian deadlift"],
  ohp: ["overhead press", "shoulder press"],
};

// 肌群/器械/类别代码 → 中文标签（与 client/src/features/gym/api.ts 的
// partNames 保持一致，另补少量口语标签）。部位通道只做单字段匹配，
// 绝不跨字段拼接（q='back lever' 仍只命中同名条目）。
const FACET_LABELS: Record<string, string[]> = {
  back: ["背部"],
  cardio: ["全身有氧", "有氧"],
  chest: ["胸部", "胸肌"],
  "lower arms": ["前臂"],
  "lower legs": ["小腿"],
  neck: ["颈部"],
  shoulders: ["肩部", "三角肌"],
  "upper arms": ["上臂"],
  "upper legs": ["大腿"],
  waist: ["腰腹", "腰部"],
  abdominals: ["腹肌", "腹部"],
  abductors: ["外展肌"],
  abs: ["腹肌", "腹部"],
  adductors: ["内收肌"],
  "ankle stabilizers": ["踝稳定肌"],
  ankles: ["踝部", "脚踝"],
  biceps: ["肱二头肌", "二头肌"],
  brachialis: ["肱肌"],
  calves: ["小腿肌", "小腿"],
  "cardiovascular system": ["心肺"],
  core: ["核心"],
  deltoids: ["三角肌"],
  delts: ["三角肌"],
  feet: ["足部", "脚部"],
  forearms: ["前臂肌", "前臂"],
  glutes: ["臀肌", "臀部"],
  "grip muscles": ["握力肌群", "握力"],
  groin: ["腹股沟"],
  hamstrings: ["腘绳肌", "大腿后侧"],
  hands: ["手部"],
  "hip flexors": ["髋屈肌"],
  "inner thighs": ["大腿内侧"],
  "latissimus dorsi": ["背阔肌"],
  lats: ["背阔肌"],
  "levator scapulae": ["肩胛提肌"],
  "lower abs": ["下腹部", "下腹"],
  "lower back": ["下背部", "下背"],
  obliques: ["腹斜肌"],
  pectorals: ["胸肌", "胸部"],
  quadriceps: ["股四头肌"],
  quads: ["股四头肌"],
  "rear deltoids": ["三角肌后束", "后束"],
  rhomboids: ["菱形肌"],
  "rotator cuff": ["肩袖"],
  "serratus anterior": ["前锯肌"],
  shins: ["胫前肌"],
  soleus: ["比目鱼肌"],
  spine: ["脊柱周围肌"],
  sternocleidomastoid: ["胸锁乳突肌"],
  trapezius: ["斜方肌"],
  traps: ["斜方肌"],
  triceps: ["肱三头肌", "三头肌"],
  "upper back": ["上背部", "上背"],
  "upper chest": ["上胸部", "上胸"],
  "wrist extensors": ["腕伸肌"],
  "wrist flexors": ["腕屈肌"],
  wrists: ["腕部"],
  assisted: ["辅助器械"],
  band: ["弹力带"],
  barbell: ["杠铃"],
  "body weight": ["徒手", "自重"],
  "bosu ball": ["波速球"],
  cable: ["绳索"],
  dumbbell: ["哑铃"],
  "elliptical machine": ["椭圆机"],
  "ez barbell": ["曲杠"],
  hammer: ["训练锤"],
  kettlebell: ["壶铃"],
  "leverage machine": ["固定器械"],
  "medicine ball": ["药球"],
  "olympic barbell": ["奥林匹克杠铃"],
  "resistance band": ["阻力带", "弹力带"],
  roller: ["泡沫轴"],
  rope: ["绳索", "战绳"],
  "skierg machine": ["滑雪机"],
  "sled machine": ["雪橇器械"],
  "smith machine": ["史密斯"],
  "stability ball": ["健身球", "瑜伽球"],
  "stationary bike": ["固定单车"],
  "stepmill machine": ["爬楼机"],
  tire: ["轮胎"],
  "trap bar": ["六角杠铃", "六角杠"],
  "upper body ergometer": ["上肢功率车"],
  weighted: ["负重"],
  "wheel roller": ["健腹轮"],
  strength: ["力量"],
  timed: ["计时"],
};

const table = pinyinTable as Record<string, string[]>;

function pinyinForms(text: string): { full: string[]; initials: string[] } {
  // 只对中文名生成拼音；英文/数字字符原样保留进全拼串。
  const chars = [...text];
  const fullVariants = new Set<string>([""]);
  const initialVariants = new Set<string>([""]);
  for (const ch of chars) {
    const readings = table[ch];
    if (!readings) {
      if (/[a-z0-9]/i.test(ch)) {
        for (const v of [...fullVariants]) {
          fullVariants.delete(v);
          fullVariants.add(v + ch.toLowerCase());
        }
      }
      continue;
    }
    if (fullVariants.size <= 16) {
      const next = new Set<string>();
      for (const v of fullVariants)
        for (const r of readings) next.add(v + r);
      fullVariants.clear();
      for (const v of [...next].slice(0, 16)) fullVariants.add(v);
    } else {
      const primary = readings[0];
      for (const v of [...fullVariants]) {
        fullVariants.delete(v);
        fullVariants.add(v + primary);
      }
    }
    if (initialVariants.size <= 32) {
      const initials = [...new Set(readings.map((r) => r[0]))];
      const next = new Set<string>();
      for (const v of initialVariants)
        for (const i of initials) next.add(v + i);
      initialVariants.clear();
      for (const v of [...next].slice(0, 32)) initialVariants.add(v);
    } else {
      const primary = readings[0][0];
      for (const v of [...initialVariants]) {
        initialVariants.delete(v);
        initialVariants.add(v + primary);
      }
    }
  }
  return { full: [...fullVariants], initials: [...initialVariants] };
}

type Field = { norm: string; words: string[]; chinese: boolean };
const toField = (raw: string): Field => ({
  norm: normalizeQuery(raw),
  words: raw
    .toLowerCase()
    .split(/[\s\-_'·]+/)
    .filter(Boolean),
  chinese: hasChinese(raw),
});

// 一个字段对查询词的命中档位：0 不命中，1 包含，2 开头，3 相等。
// 拉丁字段对短词（≤3）收紧：跨词巧合子串不算包含（sd ✗ palms down），
// 词首命中（dip ✓ triceps dip）保留包含档。
function fieldTier(field: Field, q: string): number {
  if (!field.norm) return 0;
  if (field.norm === q) return 3;
  if (field.norm.startsWith(q)) return 2;
  if (field.chinese) return field.norm.includes(q) ? 1 : 0;
  if (q.length >= 4) return field.norm.includes(q) ? 1 : 0;
  return field.words.some((w) => w.startsWith(q)) ? 1 : 0;
}

type SearchIndex = {
  names: Field[];
  aliases: Field[];
  instructions: Field[];
  pinyinFull: string[];
  pinyinInitials: string[];
  facetLabels: string[];
  facetCodes: string[];
  hasMedia: boolean;
};

const indexCache = new WeakMap<Exercise, SearchIndex>();

function indexOf(e: Exercise): SearchIndex {
  const cached = indexCache.get(e);
  if (cached) return cached;
  const aliases = ((e as any).aliases || []) as string[];
  const zhTexts = [e.nameZh, ...aliases].filter(
    (t) => typeof t === "string" && hasChinese(t),
  );
  const full = new Set<string>();
  const initials = new Set<string>();
  for (const t of zhTexts) {
    const forms = pinyinForms(t);
    forms.full.forEach((v) => full.add(v));
    forms.initials.forEach((v) => initials.add(v));
  }
  const facetCodes = [
    e.bodyPart,
    e.target,
    e.equipment,
    e.category,
    ...(e.secondaryMuscles || []),
  ].filter(Boolean) as string[];
  const facetLabels = facetCodes.flatMap((code) => FACET_LABELS[code] || []);
  const media = mediaIndex[e.id];
  const index: SearchIndex = {
    names: [toField(e.name || ""), toField(e.nameZh || "")],
    aliases: aliases.map((a) => toField(String(a))),
    instructions: (e.instructions || []).map((i) => toField(String(i))),
    pinyinFull: [...full],
    pinyinInitials: [...initials],
    facetLabels: facetLabels.map(normalizeQuery),
    facetCodes: facetCodes.map(normalizeQuery),
    hasMedia: !!media && (media.images > 0 || media.video),
  };
  indexCache.set(e, index);
  return index;
}

const FILLER = /[练训练的部肌肉动作想我要做个]/g;

function facetScore(index: SearchIndex, q: string): number {
  let best = 0;
  // 英文代码精确命中（如直接搜 back、dumbbell）
  if (/^[a-z0-9]+$/.test(q) && index.facetCodes.includes(q)) best = 40;
  if (hasChinese(q)) {
    const core = q.replace(FILLER, "");
    if (core) {
      for (const label of index.facetLabels) {
        if (label === core) best = Math.max(best, 40);
        else if (label.startsWith(core)) best = Math.max(best, 36);
        else if (core.length >= 2 && label.includes(core))
          best = Math.max(best, 36);
        else if (
          core.length === 1 &&
          "腿臂".includes(core) &&
          label.includes(core)
        )
          best = Math.max(best, 36);
      }
    }
  }
  return best;
}

export function scoreExercise(
  e: Exercise,
  qRaw: string,
  favorites: Set<string>,
): number {
  const q = normalizeQuery(qRaw);
  if (!q) return 0;
  const index = indexOf(e);
  let best = 0;
  const hit = (fields: Field[], tiers: [number, number, number]) => {
    for (const f of fields) {
      const tier = fieldTier(f, q);
      if (tier) best = Math.max(best, tiers[tier - 1]);
    }
  };
  // tiers 按 [包含，开头，相等] 索引（fieldTier 返回 1/2/3）
  hit(index.names, [65, 85, 100]);
  hit(index.aliases, [55, 60, 70]);
  // 俗称扩展：命中名称/别名按 58 计
  for (const [term, expansions] of Object.entries(SYNONYMS)) {
    const key = normalizeQuery(term);
    if (q === key || (key.length >= 2 && q.includes(key))) {
      for (const ex of expansions) {
        const n = normalizeQuery(ex);
        if (
          index.names.some((f) => f.norm.includes(n)) ||
          index.aliases.some((f) => f.norm.includes(n))
        )
          best = Math.max(best, 58);
      }
    }
  }
  // 拼音：仅当输入是纯拉丁字母时启用
  if (/^[a-z]+$/.test(q) && q.length >= 2) {
    for (const f of index.pinyinFull) {
      if (f === q) best = Math.max(best, 62);
      else if (f.startsWith(q)) best = Math.max(best, 52);
      else if (f.includes(q)) best = Math.max(best, 46);
    }
    for (const f of index.pinyinInitials) {
      if (f === q) best = Math.max(best, 48);
      else if (f.startsWith(q)) best = Math.max(best, 42);
      else if (f.includes(q)) best = Math.max(best, 34);
    }
  }
  best = Math.max(best, facetScore(index, q));
  if (best === 0 && index.instructions.some((f) => fieldTier(f, q) > 0))
    best = 15;
  if (best === 0) return 0;
  if (index.hasMedia) best += 6;
  if (favorites.has(e.id)) best += 4;
  return best;
}

// 带查询时：打分 → 过滤 0 分 → 相关性降序（同分保持原顺序）。
// 无查询时原样返回，浏览顺序与旧行为一致。
export function rankByQuery<T extends Exercise>(
  list: T[],
  qRaw: string,
  favorites: Set<string>,
): T[] {
  const q = normalizeQuery(qRaw || "");
  if (!q) return list;
  const scored: { e: T; score: number; at: number }[] = [];
  list.forEach((e, at) => {
    const score = scoreExercise(e, qRaw, favorites);
    if (score > 0) scored.push({ e, score, at });
  });
  scored.sort((a, b) => b.score - a.score || a.at - b.at);
  return scored.map((s) => s.e);
}
