import {test} from 'node:test';
import assert from 'node:assert/strict';
import {partNames, label} from '../src/features/gym/api';
import catalog from '../../server/src/gym/catalog.json';

// The settings page (「我拥有的器械」) and the library equipment filter both
// render one option per equipment key present in the catalog, labelled via
// label(). Distinct keys must never share one label: `rope` and `cable` both
// rendered as 「绳索」, so the settings list showed 绳索 twice even though
// they are different equipment (10 rope exercises vs 157 cable exercises).
const equipmentKeys = [...new Set((catalog as any[]).map((e) => e.equipment as string))];

test('every catalog equipment key has a Chinese label', () => {
  assert.ok(equipmentKeys.length > 0);
  for (const key of equipmentKeys) {
    assert.ok(partNames[key], `equipment "${key}" has no label in partNames`);
    assert.notEqual(label(key), key, `equipment "${key}" renders untranslated`);
  }
});

test('equipment labels are unique per key (no duplicated option text)', () => {
  const byLabel = new Map<string, string>();
  for (const key of equipmentKeys) {
    const text = label(key);
    assert.ok(
      !byLabel.has(text),
      `equipment "${key}" and "${byLabel.get(text)}" both render as 「${text}」`,
    );
    byLabel.set(text, key);
  }
});

test('rope and cable stay distinct equipment with distinct labels', () => {
  assert.notEqual(label('rope'), label('cable'));
});
