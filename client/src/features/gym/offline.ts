import {clearWorkoutRecoveryStorage} from './workoutRecoveryStorage';
const prefix = "gym:read:v1:";
export function readCache(uid: string | number, path: string) {
  try {
    return JSON.parse(
      localStorage.getItem(prefix + uid + ":" + path) || "null",
    );
  } catch {
    return null;
  }
}
export function writeCache(uid: string | number, path: string, data: any) {
  try {
    const value = JSON.stringify({ savedAt: Date.now(), data });
    if (value.length < 800000)
      localStorage.setItem(prefix + uid + ":" + path, value);
  } catch {
    /* Storage limits do not turn a successful network operation into failure. */
  }
}
export function clearAccountCache(uid: string | number) {
  clearWorkoutRecoveryStorage(uid);
  try { for (const key of Object.keys(localStorage))
    if (
      key.startsWith(prefix + uid + ":") ||
      key.startsWith("gym:pending:" + uid + ":") ||
      key.startsWith("gym:draft:" + uid + ":") ||
      key.startsWith("gym:start:" + uid + ":") ||
      key === "gym:free:" + uid
    )
      localStorage.removeItem(key); } catch { /* Memory recovery is still cleared when browser storage is blocked. */ }
  if (typeof indexedDB !== "undefined")
    void transferDraft("delete", String(uid)).catch(() => {});
}
export function transferDraft(
  action: "get" | "put" | "delete",
  uid: string,
  value?: any,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("movemate-training-drafts", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("drafts");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result,
        tx = db.transaction(
          "drafts",
          action === "get" ? "readonly" : "readwrite",
        ),
        store = tx.objectStore("drafts");
      const request =
        action === "get"
          ? store.get(uid)
          : action === "put"
            ? store.put(value, uid)
            : store.delete(uid);
      let result: any;
      request.onsuccess = () => (result = request.result);
      tx.oncomplete = () => {
        db.close();
        resolve(result);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    };
  });
}
