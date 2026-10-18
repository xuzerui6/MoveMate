import { useCallback, useEffect, useState } from "react";
import client, { getErrorMessage } from "../../api/client";
import { useAuthStore } from "../../stores/authStore";
import { readCache, writeCache } from "./offline";
export { getErrorMessage };
export async function request(
  method: string,
  path: string,
  body?: unknown,
  token = localStorage.getItem("token"),
): Promise<any> {
  const uid = useAuthStore.getState().user?.id;
  const cacheable =
    method.toUpperCase() === "GET" &&
    uid != null &&
    /^\/(exercises|training-plans|workout-sessions|training-settings|training-schedule|training-analytics|body-measurements)(?:[/?]|$)/.test(
      path,
    );
  if (method.toUpperCase() !== "GET" && !navigator.onLine)
    throw new Error("当前离线，正式操作需联网；草稿与未确认操作会保留");
  try {
    const response: any = await client.request({
      method,
      url: path,
      data: body,
      headers: { Authorization: "Bearer " + token },
    });
    if (
      cacheable &&
      useAuthStore.getState().user?.id === uid &&
      localStorage.getItem("token") === token
    )
      writeCache(uid!, path, response.data);
    return response.data;
  } catch (error: any) {
    if (cacheable && !error?.response) {
      const cached = readCache(uid!, path);
      if (cached)
        return Object.assign(structuredClone(cached.data), { __offline: true });
    }
    throw error;
  }
}
export async function beginWorkout(values: any) {
  if (!navigator.onLine)
    throw new Error("离线不能新建正式计时，请联网后再开始");
  const uid = useAuthStore.getState().user?.id,
    token = localStorage.getItem("token"),
    key = "gym:start:" + uid + ":" + JSON.stringify(values);
  const id = localStorage.getItem(key) || crypto.randomUUID();
  localStorage.setItem(key, id);
  try {
    const w = await request(
      "POST",
      "/workout-sessions",
      { id, ...values },
      token,
    );
    localStorage.removeItem(key);
    return w;
  } catch (error: any) {
    const found = await request(
      "GET",
      "/workout-sessions/" + id,
      undefined,
      token,
    ).catch(() => null);
    if (found) {
      localStorage.removeItem(key);
      return found;
    }
    if (error?.response?.status && error.response.status < 500)
      localStorage.removeItem(key);
    window.dispatchEvent(new Event("motion:refresh"));
    throw error;
  }
}
export function useGymQuery(path: string) {
  const uid = useAuthStore((s) => s.user?.id);
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [nonce, setNonce] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setData(null);
    setError("");
    void request("GET", path)
      .then((value) => {
        if (alive) setData(value);
      })
      .catch((e) => {
        if (alive) setError(getErrorMessage(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [path, nonce, uid]);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, loading, reload, setData };
}
export const formatTime = (s: number) =>
  `${Math.floor(s / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(s % 60)
    .toString()
    .padStart(2, "0")}`;
export const partNames: Record<string, string> = {
  "full body": "全身",
  quads: "股四头肌",
  "cardiovascular system": "心肺",
  "upper back": "上背部",
  "serratus anterior": "前锯肌",
  "levator scapulae": "肩胛提肌",
  "hip flexors": "髋屈肌",
  "lower back": "下背部",
  rhomboids: "菱形肌",
  "ankle stabilizers": "踝稳定肌",
  core: "核心",
  "rear deltoids": "三角肌后束",
  trapezius: "斜方肌",
  ankles: "踝部",
  feet: "足部",
  deltoids: "三角肌",
  brachialis: "肱肌",
  groin: "腹股沟",
  wrists: "腕部",
  "rotator cuff": "肩袖",
  "upper chest": "上胸部",
  "latissimus dorsi": "背阔肌",
  "wrist flexors": "腕屈肌",
  "wrist extensors": "腕伸肌",
  abdominals: "腹肌",
  "grip muscles": "握力肌群",
  "lower abs": "下腹部",
  "inner thighs": "大腿内侧",
  soleus: "比目鱼肌",
  sternocleidomastoid: "胸锁乳突肌",
  hands: "手部",
  shins: "胫前肌",
  quadriceps: "股四头肌",
  hamstrings: "腘绳肌",
  glutes: "臀肌",
  calves: "小腿肌",
  pectorals: "胸肌",
  lats: "背阔肌",
  biceps: "肱二头肌",
  triceps: "肱三头肌",
  abs: "腹肌",
  delts: "三角肌",
  traps: "斜方肌",
  forearms: "前臂肌",
  adductors: "内收肌",
  abductors: "外展肌",
  spine: "脊柱周围肌",
  serratus_anterior: "前锯肌",
  cardiovascular_system: "心肺",
  obliques: "腹斜肌",
  assisted: "辅助器械",
  "medicine ball": "药球",
  "stability ball": "健身球",
  rope: "绳索",
  "ez barbell": "曲杠",
  "sled machine": "雪橇器械",
  "upper body ergometer": "上肢功率车",
  "olympic barbell": "奥林匹克杠铃",
  weighted: "负重",
  "bosu ball": "波速球",
  "resistance band": "阻力带",
  roller: "泡沫轴",
  "skierg machine": "滑雪机",
  hammer: "训练锤",
  "wheel roller": "健腹轮",
  "stationary bike": "固定单车",
  tire: "轮胎",
  "trap bar": "六角杠铃",
  "elliptical machine": "椭圆机",
  "stepmill machine": "爬楼机",

  "upper legs": "大腿",
  "upper arms": "上臂",
  "lower legs": "小腿",
  "lower arms": "前臂",
  chest: "胸部",
  back: "背部",
  waist: "腰腹",
  shoulders: "肩部",
  cardio: "全身有氧",
  neck: "颈部",
  strength: "力量",
  timed: "计时",
  "body weight": "徒手",
  barbell: "杠铃",
  dumbbell: "哑铃",
  cable: "绳索",
  band: "弹力带",
  "leverage machine": "固定器械",
  "smith machine": "史密斯",
  kettlebell: "壶铃",
};
export const label = (value: string) => partNames[value] || value;
export function download(
  name: string,
  data: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
