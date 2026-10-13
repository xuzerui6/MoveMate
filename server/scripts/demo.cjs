const { prepareDemo } = require('./prepare-demo.cjs');
const path = require('node:path');

function loadDemo() {
  const { root, file } = prepareDemo();
  process.chdir(root);
  process.env.ENV_FILE = file;
  // Explicitly isolate demo execution from existing shell/production settings.
  require('dotenv').config({ path: file, override: true });
  process.env.SQLITE_PATH = path.join(root, 'data', 'demo.db');
  process.env.SMTP_USER = '';
  process.env.SMTP_PASS = '';
  process.env.ADMIN_EMAIL = '';
  process.env.HOST = '127.0.0.1';
  if (!process.env.DEMO_PASSWORD) throw new Error('.env.demo is missing DEMO_PASSWORD');
}

async function seedDemo() {
  loadDemo();
  const bcrypt = require('bcrypt');
  const { pool, withTransaction } = require('../dist/db');
  const { hashStudentId } = require('../dist/utils/hash');
  const passwordHash = await bcrypt.hash(process.env.DEMO_PASSWORD, 10);
  const accounts = [['host', '演示发起人'], ['player1', '演示成员一'], ['player2', '演示成员二']];
  await withTransaction(async (client) => {
    for (const [name, nickname] of accounts) {
      await client.query(
        `INSERT INTO users (nickname, email, password_hash, student_id, school_id, campus_id, email_verified)
         VALUES ($1, $2, $3, $4, 1, 1, 1) ON CONFLICT(email) DO NOTHING`,
        [nickname, name + '@dajju.local', passwordHash, hashStudentId('demo-' + name)],
      );
    }
  });
  console.log('[Demo] Accounts: host@dajju.local / player1@dajju.local / player2@dajju.local');
  console.log('[Demo] Password: ' + process.env.DEMO_PASSWORD);
  console.log('[Demo] Database: ' + process.env.SQLITE_PATH);
  console.log('[Demo] URL: http://localhost:3001');
}

if (require.main === module) {
  (async () => {
    if (process.argv[2] === 'seed') { await seedDemo(); return; }
    loadDemo();
    console.log('[Demo] Login: host@dajju.local / player1@dajju.local / player2@dajju.local');
    console.log('[Demo] Password: ' + process.env.DEMO_PASSWORD);
    await require('../dist/app').start();
  })().catch((error) => { console.error('[Demo] Failed:', error.message); process.exitCode = 1; });
}

module.exports = { loadDemo, seedDemo };
