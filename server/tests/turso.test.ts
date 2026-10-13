import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {TursoDatabase} from '../src/db/turso-adapter';

test('cloud adapter initializes fresh metadata, preserves committed data on restart and rolls back failures',async()=>{
  const file=path.join(mkdtempSync(path.join(tmpdir(),'movemate-libsql-')),'cloud.db');
  const url='file:'+file;
  let db=new TursoDatabase(url);
  try {
    await db.init();
    assert.equal((await db.query('SELECT COUNT(*) AS n FROM campuses')).rows[0].n,3);
    assert.equal((await db.query('SELECT COUNT(*) AS n FROM users')).rows[0].n,0);
    await db.query('BEGIN IMMEDIATE');
    const created=await db.query('INSERT INTO users(nickname,email,password_hash,student_id,email_verified) VALUES($2,$1,$3,$4,TRUE) RETURNING *',['cloud@test.local','云端用户','not-a-login-hash','cloud-test-student']);
    assert.equal(created.rowCount,1);assert.equal(created.rows[0].email_verified,true);assert.match(created.rows[0].created_at,/Z$/);
    const userId=created.rows[0].id;
    await db.query('COMMIT');
    await db.query('BEGIN IMMEDIATE');
    await db.query('UPDATE users SET nickname=$1 WHERE id=$2',['rolled-back',userId]);
    await assert.rejects(db.query('INSERT INTO users(nickname,email,password_hash,student_id) VALUES($1,$2,$3,$4)',['duplicate','cloud@test.local','test','other-student']),/UNIQUE/);
    await db.query('ROLLBACK');
    assert.equal((await db.query('SELECT nickname FROM users WHERE id=$1',[userId])).rows[0].nickname,'云端用户');
    db.close();db=new TursoDatabase(url);await db.init();
    assert.equal((await db.query('SELECT COUNT(*) AS n FROM users')).rows[0].n,1);
    assert.equal((await db.query('SELECT COUNT(*) AS n FROM campuses')).rows[0].n,3);
    await db.query('BEGIN IMMEDIATE');await db.query('UPDATE users SET nickname=$1 WHERE id=$2',['after-recovery',userId]);await db.query('COMMIT');
    assert.equal((await db.query('SELECT nickname FROM users WHERE id=$1',[userId])).rows[0].nickname,'after-recovery');
  } finally {db.close()}
  assert.throws(()=>new TursoDatabase('libsql://invalid.local'),/AUTH_TOKEN/);
});
