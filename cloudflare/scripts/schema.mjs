import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
// Generated from a fresh in-memory database, never from local demo/user data.
const { databaseBootstrap } = require('../../server/dist/db/sqlite-adapter.js');
await writeFile(new URL('../src/schema.json', import.meta.url), JSON.stringify(databaseBootstrap(), null, 2) + '\n');
