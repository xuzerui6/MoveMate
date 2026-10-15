import { execFileSync } from 'node:child_process';
execFileSync(process.execPath, ['scripts/build.mjs'], { stdio: 'inherit', env: { ...process.env, CF_TEST_BUILD: '1' } });
execFileSync(process.execPath, ['--test', 'tests/runtime.test.mjs'], { stdio: 'inherit' });
