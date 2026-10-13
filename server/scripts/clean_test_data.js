const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, '..', 'data', 'dajju.db'));

console.log('=== 清理前数据统计 ===');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
for (const t of tables) {
  const c = db.prepare('SELECT COUNT(*) as n FROM [' + t.name + ']').get();
  console.log('  ' + t.name + ': ' + c.n + ' rows');
}

console.log('\n开始清理...');

db.exec('BEGIN');

// 按外键依赖顺序删除：先删子表，再删主表
for (const table of ['chat_messages', 'notifications', 'game_members', 'games', 'users']) {
  try {
    const r = db.prepare('DELETE FROM ' + table).run();
    console.log('  ' + table + ': 删除 ' + r.changes + ' 条');
  } catch (e) {
    console.log('  ' + table + ': 跳过 (' + e.message + ')');
  }
}

console.log('\n  种子数据（schools/campuses/venues）已保留');

// 重置序列号（不影响种子表）
try {
  db.prepare("DELETE FROM sqlite_sequence WHERE name NOT IN ('schools','campuses','venues')").run();
  console.log('  sqlite_sequence 已重置');
} catch (e) {
  // 有些版本没有这个表，忽略
}

db.exec('COMMIT');

console.log('\n=== 清理后数据统计 ===');
for (const t of tables) {
  const c = db.prepare('SELECT COUNT(*) as n FROM [' + t.name + ']').get();
  console.log('  ' + t.name + ': ' + c.n + ' rows');
}

console.log('\n清理完成！数据库已准备好上传。');
db.close();
