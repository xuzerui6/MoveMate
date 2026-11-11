// Regenerates src/features/motion/lib/picker-metadata.json — the library metadata
// (bodyPart / equipment / target) the AI 动作训练 picker groups by. Source of truth:
// server/src/gym/catalog.json for every camera movement's first linked library
// entry; the four base movements have no library entry, so theirs are stated here.
// Run from client/: node scripts/generate-picker-metadata.mjs
import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const catalog = JSON.parse(readFileSync(join(repo, 'server/src/gym/catalog.json'), 'utf8'));
const definitions = JSON.parse(readFileSync(join(repo, 'server/src/gym/new-recognition.json'), 'utf8'));
const byId = new Map(catalog.map(entry => [entry.id, entry]));

const metadata = {
  squat: {bodyPart: 'upper legs', equipment: 'body weight', target: 'quadriceps'},
  push_up: {bodyPart: 'chest', equipment: 'body weight', target: 'pectorals'},
  jumping_jack: {bodyPart: 'cardio', equipment: 'body weight', target: 'cardiovascular system'},
  high_knees: {bodyPart: 'cardio', equipment: 'body weight', target: 'cardiovascular system'},
};
for (const [type, definition] of Object.entries(definitions)) {
  const entry = byId.get(definition.exerciseIds[0]);
  if (!entry) throw new Error(`catalog entry missing for ${type}: ${definition.exerciseIds[0]}`);
  metadata[type] = {bodyPart: entry.bodyPart, equipment: entry.equipment, target: entry.target};
}
const out = join(here, '..', 'src/features/motion/lib/picker-metadata.json');
writeFileSync(out, JSON.stringify(metadata, null, 2) + '\n');
console.log(`wrote ${Object.keys(metadata).length} entries to ${out}`);
