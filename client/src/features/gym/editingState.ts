/** A save acknowledges its submitted revision, never edits made while awaiting it. */
export class SnapshotEditor<T> {
  revision = 0;
  savedRevision = 0;
  busy = false;
  private pending: {value: T; revision: number} | null = null;
  constructor(public value: T, dirty = false) {
    this.value = structuredClone(value);
    if (dirty) this.revision = 1;
  }
  get dirty() { return this.revision !== this.savedRevision; }
  get uncertain() { return this.pending !== null; }
  edit(change: (next: T) => void) {
    const next = structuredClone(this.value);
    change(next);
    this.value = next;
    this.revision++;
    return next;
  }
  async save(
    send: (value: T) => Promise<T>, read: () => Promise<T>,
    matches: (server: T, submitted: T) => boolean,
    merge: (current: T, server: T, submitted: T) => T,
    conflicts: (server: T, submitted: T) => boolean = () => false,
  ) {
    if (this.busy) return false;
    this.busy = true;
    const acknowledge = (server: T, submitted: {value: T; revision: number}) => {
      if ((server as any)?.__offline) throw Error('缓存不能确认保存，请联网核对');
      this.value = this.revision === submitted.revision ? server : merge(this.value, server, submitted.value);
      this.savedRevision = submitted.revision;
      this.pending = null;
    };
    try {
      if (this.pending) {
        const latest = await read();
        if ((latest as any)?.__offline) throw Error('当前只能读取缓存，请联网后核对保存结果');
        if (matches(latest, this.pending.value)) {
          acknowledge(latest, this.pending); return true;
        }
        if (conflicts(latest, this.pending.value)) {
          this.pending = null;
          throw Error('服务器版本已变化，本机草稿已保留，请先核对服务器版本');
        }
      }
      const submitted = this.pending || {value: structuredClone(this.value), revision: this.revision};
      this.pending = submitted;
      try { acknowledge(await send(submitted.value), submitted); }
      catch (error: any) {
        const status = error?.response?.status || error?.status;
        if (status && status < 500) this.pending = null;
        else {
          // A lost response may follow a successful commit. Read before retrying.
          try {
            const latest = await read();
            if (!(latest as any)?.__offline && matches(latest, submitted.value)) {
              acknowledge(latest, submitted); return true;
            }
          } catch { /* Keep the submitted snapshot and original error. */ }
        }
        throw error;
      }
      return true;
    } finally { this.busy = false; }
  }
}
const stable = (value: any): any => Array.isArray(value) ? value.map(stable) :
  value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort()
    .filter(k => k !== '__offline' && value[k] !== undefined).map(k => [k, stable(value[k])])) : value;
export const sameContent = (a: any, b: any) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
export function changedFields(base: any, next: any) {
  return Object.fromEntries(Object.keys(next).filter(k => k !== '__offline' && !sameContent(base[k], next[k])).map(k => [k,next[k]]));
}
export function planSaveConfirmed(server: any, submitted: any) {
  const content = (p: any) => Object.fromEntries(['name','mode','rotationCursor','progression','routines'].map(k => [k,p[k]]));
  return server?.id === submitted.id && server.version === submitted.version + 1 && sameContent(content(server), content(submitted));
}
