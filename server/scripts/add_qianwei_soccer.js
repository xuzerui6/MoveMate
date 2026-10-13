const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, '..', 'data', 'dajju.db'));

try {
  const existing = db.prepare('SELECT id FROM venues WHERE name = ? AND campus_id = 1').get('前卫南区足球场');
  if (existing) {
    console.log('前卫南区足球场 already exists');
  } else {
    db.exec("INSERT INTO venues (school_id, campus_id, name, sport_types, is_active) VALUES (1, 1, '前卫南区足球场', '[\"soccer\"]', 1)");
    console.log('前卫南区足球场 added.');
  }
} catch (e) {
  console.error('Error:', e.message);
}

db.close();
