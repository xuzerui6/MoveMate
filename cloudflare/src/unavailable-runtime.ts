export async function initDatabase(): Promise<void> { throw new Error('Missing Durable Object database scope'); }
export async function databaseQuery(): Promise<never> { throw new Error('Missing Durable Object database scope'); }
export const isVercelRuntime = false;
export async function ensureCloudRuntime(): Promise<void> {}
