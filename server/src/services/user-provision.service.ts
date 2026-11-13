import bcrypt from 'bcrypt';
import { pool, withTransaction } from '../db/pool';
import { hashStudentId } from '../utils/hash';
import { ADMIN_LOGIN_EMAIL } from '../utils/login-identity';
import { randomUUID } from 'node:crypto';

/** bcrypt 哈希轮数（与 auth.service 注册保持一致） */
const SALT_ROUNDS = 10;

export interface ProvisionUserInput {
  nickname: string;
  email: string;
  ['password']: string;
  schoolId: number;
  campusId: number;
}

/**
 * Operator-only user provisioning. Never called by registration or ordinary JWT routes.
 * 与 provisionAdmin 同构：只经运营通道（migration）调用。明文密码在服务内哈希，
 * 账号直接置为邮箱已验证、非管理员；不改变学校/校区的启用状态——给关闭中的学校
 * （如吉林体育学院）开内测号不会把学校对外打开，公开注册仍由注册路径自行拦截。
 */
export async function provisionUser(input: ProvisionUserInput) {
  const nickname = (input?.nickname || '').trim();
  const email = (input?.email || '').trim().toLowerCase();
  if (!nickname) throw new Error('Nickname required');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Invalid email');
  if (email === ADMIN_LOGIN_EMAIL) throw new Error('Reserved identity cannot be provisioned as an ordinary user');
  if (typeof input?.password !== 'string' || input.password.length < 8 || input.password.length > 128) {
    throw new Error('Password must be 8-128 characters');
  }
  const schoolId = Number(input.schoolId);
  const campusId = Number(input.campusId);
  if (!Number.isInteger(schoolId) || schoolId <= 0 || !Number.isInteger(campusId) || campusId <= 0) {
    throw new Error('Invalid school or campus');
  }
  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  return withTransaction(async () => {
    const school = (await pool.query('SELECT id FROM schools WHERE id=$1', [schoolId])).rows[0];
    if (!school) throw new Error('School not found');
    const campus = (await pool.query('SELECT id FROM campuses WHERE id=$1 AND school_id=$2', [campusId, schoolId])).rows[0];
    if (!campus) throw new Error('Campus not found for school');
    const existing = (await pool.query('SELECT id FROM users WHERE email=$1', [email])).rows[0];
    if (existing) throw new Error('Email already exists');
    const result = await pool.query(
      `INSERT INTO users(nickname,email,password_hash,student_id,school_id,campus_id,email_verified,is_admin)
       VALUES($1,$2,$3,$4,$5,$6,TRUE,0) RETURNING id`,
      [nickname, email, passwordHash, hashStudentId('operator-' + randomUUID()), schoolId, campusId],
    );
    return { id: result.rows[0].id, account: email, created: true };
  });
}
