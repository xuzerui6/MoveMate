const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, '..', 'data', 'dajju.db'));

try {
  db.exec("ALTER TABLE users ADD COLUMN sport_preferences TEXT DEFAULT '[]'");
  console.log('Column sport_preferences added.');
} catch (e) {
  if (e.message.includes('duplicate column')) {
    console.log('Column already exists:', e.message);
  } else {
    console.error('Error:', e.message);
  }
}

db.close();
