/** A second click cannot send a competing write for the same account/exercise. */
export class FavoriteRequests {
  private pending = new Set<string>();
  async run(key: string, write: () => Promise<void>) {
    if (this.pending.has(key)) return false;
    this.pending.add(key);
    try { await write(); return true; }
    finally { this.pending.delete(key); }
  }
}
export function mergeExercisePage(previous: any[], incoming: any[], append: boolean, favorites: Map<string, boolean>) {
  return Array.from(new Map((append ? [...previous, ...incoming] : incoming)
    .map(e => [e.id, favorites.has(e.id) ? {...e, favorite: favorites.get(e.id)} : e])).values());
}
