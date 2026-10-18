import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
execFileSync(process.execPath, ['--test', '--import', 'tsx', 'tests/*.test.ts'], {
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  env: {...process.env, MOVEMATE_MEDIA_TEST_SCOPE: 'repository'},
  stdio: 'inherit',
});
