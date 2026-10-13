import bcrypt from 'bcrypt';
import { pool, withTransaction } from './db';
import { hashStudentId } from './utils/hash';

export const isVercelRuntime = process.env.VERCEL === '1' && process.env.VERCEL_ENV !== 'development';
let initialized: Promise<void> | null = null;

/** Called at request time, never during the frontend build. */
export function ensureCloudRuntime(): Promise<void> {
  if (!isVercelRuntime && !process.env.TURSO_DATABASE_URL) return Promise.resolve();
  if (initialized) return initialized;
  initialized = (async () => {
    for (const key of ['TURSO_DATABASE_URL', 'JWT_SECRET', 'STUDENT_ID_SALT']) {
      if (!process.env[key]) throw new Error(`Missing cloud environment variable: ${key}`);
    }
    for (const key of ['JWT_SECRET', 'STUDENT_ID_SALT']) {
      if (process.env[key]!.length < 32 || /please-change|your-super-secret|your-student/i.test(process.env[key]!)) {
        throw new Error(`Set a random secret with at least 32 characters: ${key}`);
      }
    }
    if (isVercelRuntime && !process.env.TURSO_AUTH_TOKEN) throw new Error('Missing TURSO_AUTH_TOKEN');
    await pool.query('SELECT 1');
    if (process.env.SEED_DEMO_ACCOUNTS === 'true') {
      const password = process.env.CLOUD_DEMO_PASSWORD;
      if (!password || password.length < 12) throw new Error('CLOUD_DEMO_PASSWORD needs at least 12 characters');
      const passwordHash = await bcrypt.hash(password, 10);
      for (const [name, nickname] of [['host', '演示发起人'], ['player1', '演示成员一'], ['player2', '演示成员二']]) {
        await withTransaction(client => client.query(
          'INSERT INTO users(nickname,email,password_hash,student_id,school_id,campus_id,email_verified) VALUES($1,$2,$3,$4,1,1,TRUE) ON CONFLICT(email) DO NOTHING',
          [nickname, name + '@dajju.local', passwordHash, hashStudentId('cloud-demo-' + name)],
        ));
      }
    }
  })().catch(error => { initialized = null; throw error; });
  return initialized;
}
