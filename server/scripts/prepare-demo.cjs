const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const file = path.join(root, '.env.demo');

function prepareDemo() {
  if (!fs.existsSync(file)) {
    const configuration = [
      'PORT=3001', 'HOST=127.0.0.1', 'NODE_ENV=development',
      'JWT_SECRET=' + crypto.randomBytes(48).toString('hex'),
      'STUDENT_ID_SALT=' + crypto.randomBytes(48).toString('hex'),
      'DEMO_PASSWORD=' + crypto.randomBytes(9).toString('base64url'),
      'SQLITE_PATH=./data/demo.db', 'BASE_URL=http://localhost:3001',
      'CORS_ORIGIN=http://localhost:3001,http://127.0.0.1:3001,http://localhost:5173',
      'SMTP_USER=', 'SMTP_PASS=', 'ADMIN_EMAIL=', '',
    ].join('\n');
    fs.writeFileSync(file, configuration, { flag: 'wx', mode: 0o600 });
    console.log('[Demo] Created isolated configuration: ' + file);
  }
  return { root, file };
}

if (require.main === module) prepareDemo();
module.exports = { prepareDemo };
