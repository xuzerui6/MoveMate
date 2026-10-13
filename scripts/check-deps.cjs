const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(process.argv[2] || '.');
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
    const installed = JSON.parse(fs.readFileSync(path.join(root, 'node_modules', name, 'package.json'), 'utf8'));
    if (installed.version !== lock.packages['node_modules/' + name]?.version) throw new Error(name + ' version differs from lockfile');
  }
  process.exitCode = 0;
} catch (error) {
  console.log('[Dependencies] ' + error.message + '; running npm ci.');
  process.exitCode = 1;
}
