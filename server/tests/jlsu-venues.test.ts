import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { databaseBootstrap } from '../src/db/sqlite-adapter';

/** 把 bootstrap 的 schema+metadata 应用到内存库，可重复应用以验证幂等 */
function buildDb(applyTimes = 1): DatabaseSync {
  const { schema, metadata } = databaseBootstrap();
  const db = new DatabaseSync(':memory:');
  for (const sql of schema) db.exec(sql);
  for (let i = 0; i < applyTimes; i++) {
    for (const row of metadata) db.prepare(row.sql).run(...row.args);
  }
  return db;
}

test('吉林体育学院元数据：学校挂牌、两校区、四场地按校区正确落位', () => {
  const db = buildDb();
  try {
    const school = db.prepare("SELECT id, name, is_active FROM schools WHERE code = 'jlsu'").get() as any;
    assert.ok(school, '应存在 code=jlsu 的学校行');
    assert.equal(school.name, '吉林体育学院');
    assert.equal(school.is_active, 1, '学校挂牌可见');

    const campuses = db
      .prepare('SELECT id, code, name, is_active FROM campuses WHERE school_id = ? ORDER BY id')
      .all(school.id) as any[];
    assert.deepEqual(
      campuses.map((c) => [c.code, c.name]),
      [
        ['jlsu-nanling', '南岭校区'],
        ['jlsu-linhe', '临河校区'],
      ],
    );
    assert.ok(campuses.every((c) => c.is_active === 0), '注册关闭期间校区不启用');

    const venues = db
      .prepare(
        `SELECT v.name, v.sport_types, v.is_active, c.name AS campus_name
         FROM venues v JOIN campuses c ON c.id = v.campus_id
         WHERE v.school_id = ? ORDER BY v.id`,
      )
      .all(school.id) as any[];
    assert.deepEqual(
      venues.map((v) => [v.campus_name, v.name, JSON.parse(v.sport_types)]),
      [
        ['南岭校区', '南岭校区室内篮球馆武术馆', ['basketball', 'fitness']],
        ['南岭校区', '南岭校区摔跤柔道馆', ['fitness']],
        ['临河校区', '临河校区田径场', ['running', 'soccer']],
        ['临河校区', '临河校区健身馆', ['fitness', 'basketball', 'volleyball', 'badminton', 'dance', 'taekwondo']],
      ],
    );
    assert.ok(venues.every((v) => v.is_active === 0), '注册关闭期间场地不启用');
  } finally {
    db.close();
  }
});

test('吉林体育学院元数据不影响吉大，且不漏进启用中的校区/场地列表', () => {
  const db = buildDb();
  try {
    const jluCampuses = db.prepare('SELECT COUNT(*) AS n FROM campuses WHERE school_id = 1').get() as any;
    const jluVenues = db.prepare('SELECT COUNT(*) AS n FROM venues WHERE school_id = 1').get() as any;
    assert.equal(jluCampuses.n, 3);
    assert.equal(jluVenues.n, 36);

    // bootstrap 接口的口径：只返回 is_active=1 的校区/场地，吉体院的不应出现
    const activeCampuses = db.prepare('SELECT school_id FROM campuses WHERE is_active = 1').all() as any[];
    const activeVenues = db.prepare('SELECT school_id FROM venues WHERE is_active = 1').all() as any[];
    assert.ok(activeCampuses.length > 0 && activeCampuses.every((c) => c.school_id === 1));
    assert.ok(activeVenues.length > 0 && activeVenues.every((v) => v.school_id === 1));
  } finally {
    db.close();
  }
});

test('吉林体育学院元数据重复应用不产生重复行', () => {
  const db = buildDb(2);
  try {
    const counts = db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM schools) AS schools,
                (SELECT COUNT(*) FROM campuses) AS campuses,
                (SELECT COUNT(*) FROM venues) AS venues`,
      )
      .get() as any;
    assert.deepEqual([counts.schools, counts.campuses, counts.venues], [2, 5, 40]);
  } finally {
    db.close();
  }
});
