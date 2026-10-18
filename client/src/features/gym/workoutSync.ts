export function restoredSetMetrics(set: any) {
  const score = set?.score || {},
    count = score.count || 0,
    mean = (n: number) => (count ? Math.round((n || 0) / count) : 0);
  return {
    reps: set?.reps || 0,
    scoreAccumulator: Number.isFinite(score.count) ? score : undefined,
    formScore: mean(score.total),
    formBreakdown: {
      depth: mean(score.depth),
      stability: mean(score.stability),
      trunk: mean(score.trunk),
      symmetry: mean(score.symmetry),
    },
  };
}
/** Rebase only when the server proves its own disconnect pause was the sole change. */
export function reconcileNetworkRecovery(pending: any, row: any) {
  if (!pending) return null;
  if (pending.action === "heartbeat" && row.phase !== "working") return null;
  if (
    row.recovery?.previousVersion === pending.version &&
    row.recovery.paused &&
    pending.setId === row.sets[row.cursor]?.id &&
    ["pause", "progress", "complete", "skip", "finish"].includes(pending.action)
  )
    return {
      ...pending,
      version: row.version,
      offline: false,
      action: pending.action === "progress" ? "pause" : pending.action,
    };
  return pending;
}
/** An immutable operation is persisted before transmission. Replay keeps its ID and version. */
export class WorkoutSync {
  private tail: Promise<unknown> = Promise.resolve();
  constructor(
    public row: any,
    private send: (body: any) => Promise<any>,
    private read: () => Promise<any>,
    private pending: { get: () => any; set: (value: any) => void },
    private accept: (row: any) => void,
  ) {}
  run(action: string, values: any = {}) {
    const task = async () => {
      if (this.pending.get())
        throw new Error("上一项操作结果尚未确认，请先恢复同步");
      const body = {
        ...structuredClone(values),
        action,
        operationId: crypto.randomUUID(),
        version: this.row.version,
        setId: this.row.sets[this.row.cursor]?.id,
      };
      this.pending.set(body);
      return this.transmit(body);
    };
    const job = this.tail.then(task);
    this.tail = job.catch(() => {});
    return job;
  }
  private async transmit(body: any) {
    try {
      const row = await this.send(body);
      this.pending.set(null);
      this.row = row;
      this.accept(row);
      return row;
    } catch (error: any) {
      // Only definitive HTTP rejection discards the operation. Network failures retain it.
      const status = error?.response?.status || error?.status;
      if (status && status < 500) {
        this.pending.set(null);
        const row = await this.read();
        this.row = row;
        this.accept(row);
      }
      throw error;
    }
  }
  recover() {
    const job = this.tail.then(async () => {
      const latest = await this.read();
      this.row = latest;
      this.accept(latest);
      const body = this.pending.get();
      return body ? this.transmit(body) : latest;
    });
    this.tail = job.catch(() => {});
    return job;
  }
}
