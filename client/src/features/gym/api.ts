import { useCallback, useEffect, useState } from "react";
import client, { getErrorMessage } from "../../api/client";
import { useAuthStore } from "../../stores/authStore";
export { getErrorMessage };
export async function request(
  method: string,
  path: string,
  body?: unknown,
  token = localStorage.getItem("token"),
): Promise<any> {
  const response: any = await client.request({
    method,
    url: path,
    data: body,
    headers: { Authorization: "Bearer " + token },
  });
  return response.data;
}
export async function beginWorkout(values: any) {
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
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [nonce, setNonce] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
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
  }, [path, nonce]);
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
