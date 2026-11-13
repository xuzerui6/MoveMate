import { readFile } from 'node:fs/promises';

/**
 * Operator caller for the migration `provision-user` action.
 * Runs on the operator's own machine (where the secrets file lives).
 *
 * Usage:
 *   node cloudflare/scripts/provision-users.mjs <targetBaseUrl> <secretsJsonPath> <usersJsonPath>
 *
 * - secretsJsonPath: JSON object containing MIGRATION_SECRET (same shape migrate.mjs reads).
 *   The secret is only used for the Authorization header; it is never printed.
 * - usersJsonPath: JSON array of { nickname, email, password, schoolId, campusId }.
 *   Passwords are sent once per user to the provision-user action and never printed.
 * Output is one line per user: OK <email> id=<id>  |  FAIL <email> <reason>.
 * Exit code is 0 only when every user was provisioned.
 */
const [target, secretsPath, usersPath] = process.argv.slice(2);
if (!/^https:\/\//.test(target || '') || !secretsPath || !usersPath) {
  console.error('Usage: node cloudflare/scripts/provision-users.mjs <targetBaseUrl> <secretsJsonPath> <usersJsonPath>');
  process.exit(2);
}
const secrets = JSON.parse(await readFile(secretsPath, 'utf8'));
if (typeof secrets.MIGRATION_SECRET !== 'string' || !secrets.MIGRATION_SECRET) {
  console.error('Secrets file has no MIGRATION_SECRET');
  process.exit(2);
}
const users = JSON.parse(await readFile(usersPath, 'utf8'));
if (!Array.isArray(users) || !users.length) {
  console.error('Users file must be a non-empty JSON array');
  process.exit(2);
}

let failures = 0;
for (const user of users) {
  const label = typeof user?.email === 'string' ? user.email : '(missing email)';
  try {
    const response = await fetch(new URL('/api/migration/provision-user', target), {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + secrets.MIGRATION_SECRET, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nickname: user.nickname, email: user.email, ['password']: user.password,
        schoolId: user.schoolId, campusId: user.campusId,
      }),
      signal: AbortSignal.timeout(30000),
    });
    const result = await response.json().catch(() => ({}));
    if (response.ok && result.created) {
      console.log(`OK ${label} id=${result.id}`);
    } else {
      failures++;
      console.log(`FAIL ${label} HTTP ${response.status}: ${result.error || 'unexpected response'}`);
    }
  } catch (error) {
    failures++;
    console.log(`FAIL ${label} ${error instanceof Error ? error.message : 'request failed'}`);
  }
}
process.exit(failures ? 1 : 0);
