import { pool, withTransaction } from '../db/pool';
import { hashStudentId } from '../utils/hash';
import { ADMIN_LOGIN_EMAIL } from '../utils/login-identity';
import { randomUUID } from 'node:crypto';

/** Operator-only provisioning. Never called by registration or ordinary JWT routes. */
export async function provisionAdmin(passwordHash: string) {
  if (!/^\$2[aby]\$(10|11|12|13|14)\$[./A-Za-z0-9]{53}$/.test(passwordHash || '')) throw new Error('Invalid bcrypt hash');
  return withTransaction(async () => {
    const existing = (await pool.query('SELECT id,is_admin FROM users WHERE email=$1', [ADMIN_LOGIN_EMAIL])).rows[0];
    if (existing) {
      if (!existing.is_admin) throw new Error('Reserved identity belongs to a non-admin; refusing to promote it');
      return { id: existing.id, account: 'admin', created: false };
    }
    const campus = (await pool.query('SELECT id,school_id FROM campuses WHERE is_active=1 ORDER BY id LIMIT 1')).rows[0];
    if (!campus) throw new Error('No active campus');
    const result = await pool.query(`INSERT INTO users(nickname,email,password_hash,student_id,school_id,campus_id,email_verified,is_admin)
      VALUES($1,$2,$3,$4,$5,$6,TRUE,1) RETURNING id`, ['管理员', ADMIN_LOGIN_EMAIL, passwordHash, hashStudentId('operator-'+randomUUID()), campus.school_id, campus.id]);
    return { id: result.rows[0].id, account: 'admin', created: true };
  });
}
