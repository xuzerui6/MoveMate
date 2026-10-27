import { readFileSync, existsSync, realpathSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, relative, dirname, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verifyMediaMetadata } from './media-metadata.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const within = (base, path) => {
  const rel = relative(base, path);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')));
};

export function mediaFiles(entries) {
  const files = new Map();
  const add = file => {
    if (!/^\/exercise-media\/[a-z0-9_-]+\.[a-f0-9]{12}\.(webp|mp4)$/.test(file.src || '')) throw Error('Invalid reviewed media path');
    if (!/^[a-f0-9]{64}$/.test(file.sha256 || '') || !file.src.includes(file.sha256.slice(0, 12))) throw Error('Invalid reviewed media hash');
    const previous = files.get(file.src);
    if (previous && (previous.sha256 !== file.sha256 || previous.distribution !== file.distribution)) throw Error('Conflicting media ownership: ' + file.src);
    files.set(file.src, file);
  };
  for (const entry of Object.values(entries)) {
    for (const file of entry.images) add(file);
    if (entry.video) {
      add(entry.video);
      add({src: entry.video.poster, sha256: entry.video.posterSha256, distribution: entry.video.distribution});
    }
  }
  return [...files.values()];
}

export function verifyExerciseMedia(options = {}) {
  const root = resolve(options.root || repo);
  const manifest = options.manifest || JSON.parse(readFileSync(resolve(root, 'client/src/features/gym/exercise-media.json'), 'utf8'));
  if(!options.manifest)verifyMediaMetadata(root,manifest);
  const publicDir = resolve(root, 'client/public');
  const files = mediaFiles(manifest.entries);
  const needsPrivate = files.some(f => f.distribution === 'site-only');
  const localConfig = resolve(root, 'server/data/media-config.json');
  const configured = options.mediaDir ?? process.env.MOVEMATE_MEDIA_DIR ??
    (existsSync(localConfig) ? JSON.parse(readFileSync(localConfig, 'utf8')).MOVEMATE_MEDIA_DIR : undefined);
  if (needsPrivate && (!configured || !existsSync(configured))) throw Error('Missing MOVEMATE_MEDIA_DIR: provide the reviewed site-only media directory before building. See docs/exercise-media-batch3.md');
  const mediaDir = needsPrivate ? realpathSync(configured) : undefined;
  if (mediaDir && within(realpathSync(root), mediaDir)) throw Error('MOVEMATE_MEDIA_DIR must stay outside the Git repository');
  const verified = files.map(file => {
    if (file.distribution && !['repository', 'site-only'].includes(file.distribution)) throw Error('Unknown media distribution');
    const base = file.distribution === 'site-only' ? mediaDir : publicDir;
    const path = resolve(base, '.' + file.src);
    if (!existsSync(path)) throw Error('Missing reviewed media: ' + file.src);
    if (!within(realpathSync(base), realpathSync(path))) throw Error('Media symlink escapes its directory: ' + file.src);
    const bytes = readFileSync(path);
    if (!bytes.length || bytes.length >= 25 * 1024 * 1024 || (file.bytes != null && bytes.length !== file.bytes) || hash(bytes) !== file.sha256) throw Error('Reviewed media checksum/size mismatch: ' + file.src);
    if (file.distribution === 'site-only' && existsSync(resolve(publicDir, '.' + file.src))) throw Error('Site-only media must not be placed in client/public: ' + file.src);
    return { ...file, path, bytes };
  });
  const restricted = new Set(verified.filter(f => f.distribution === 'site-only').map(f => f.sha256));
  for (const entry of Object.values(manifest.entries)) {
    for (const source of entry.sources) if (source.distribution === 'site-only') {
      for (const h of source.sourceSha256 || []) restricted.add(h);
    }
  }
  if (restricted.size) {
    const tracked = options.trackedPaths ?? execFileSync('git', ['ls-files', '-z', '--cached'], {cwd: root, encoding: 'utf8'}).split('\0').filter(Boolean);
    for (const name of tracked) if (/\.(mp4|mov|webp|jpg|jpeg|png|gif)$/i.test(name)) {
      const path = resolve(root, name);
      if (existsSync(path) && restricted.has(hash(readFileSync(path)))) throw Error('Site-only source or derivative is tracked by Git: ' + name);
    }
    if (options.trackedPaths == null) {
      const staged = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], {cwd: root, encoding: 'utf8'}).split('\0');
      for (const name of staged) if (/\.(mp4|mov|webp|jpg|jpeg|png|gif)$/i.test(name)) {
        const bytes = execFileSync('git', ['show', ':' + name], {cwd: root, maxBuffer: 30 * 1024 * 1024});
        if (restricted.has(hash(bytes))) throw Error('Site-only source or derivative is staged in Git: ' + name);
      }
    }
  }
  return verified;
}

export function installExerciseMedia(output, options = {}) {
  const files = verifyExerciseMedia(options);
  const destination = resolve(output);
  for (const file of files) if (file.distribution === 'site-only') {
    const target = resolve(destination, '.' + file.src);
    mkdirSync(dirname(target), {recursive: true});
    writeFileSync(target, file.bytes);
  }
  return files.length;
}

export function exerciseMediaPlugin() {
  let output;
  return {
    name: 'reviewed-exercise-media',
    configResolved(config) { output = resolve(config.root, config.build.outDir); },
    buildStart() { verifyExerciseMedia(); },
    closeBundle() { installExerciseMedia(output); },
    configureServer(server) {
      const files = verifyExerciseMedia();
      const local = new Map(files.filter(f => f.distribution === 'site-only').map(f => [f.src, f]));
      server.middlewares.use((req, res, next) => {
        const file = local.get((req.url || '').split('?')[0]);
        if (!file) return next();
        res.setHeader('Content-Type', file.src.endsWith('.mp4') ? 'video/mp4' : 'image/webp');
        res.setHeader('Content-Length', String(file.bytes.length));
        res.setHeader('Cache-Control', 'no-cache');
        res.end(req.method === 'HEAD' ? undefined : file.bytes);
      });
    },
  };
}
