const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, '..', 'data', 'dajju.db'));

console.log('=== game_members schema ===');
try {
  const cols = db.prepare("PRAGMA table_info(game_members)").all();
  cols.forEach(c => console.log('  ', c.name, c.type));
} catch(e) { console.log('Error:', e.message); }

console.log('\n=== users sample ===');
try {
  const r = db.prepare('SELECT id, nickname, avatar_url, is_admin, created_at FROM users LIMIT 1').get();
  console.log(JSON.stringify(r));
} catch(e) { console.log('Error:', e.message); }

console.log('\n=== test stats queries ===');
try {
  let r = db.prepare("SELECT COUNT(*) as n FROM users WHERE date(created_at) = date('now')").get();
  console.log('today users:', r.n);
  r = db.prepare("SELECT COUNT(DISTINCT user_id) as n FROM game_members WHERE date(created_at) >= date('now','-7 days') AND left_at IS NULL").get();
  console.log('active users:', r.n);
  r = db.prepare('SELECT COUNT(*) as n FROM games').get();
  console.log('total games:', r.n);
  r = db.prepare('SELECT COUNT(*) as n FROM feedback').get();
  console.log('feedback:', r.n);
} catch(e) { console.log('SQL Error:', e.message); }

console.log('\n=== uploads ===');
const fs = require('fs');
const upDir = path.join(__dirname, '..', 'public', 'uploads');
if (fs.existsSync(upDir)) {
  const files = fs.readdirSync(upDir);
  console.log('Files:', files);
} else {
  console.log('uploads dir missing');
}

db.close();
