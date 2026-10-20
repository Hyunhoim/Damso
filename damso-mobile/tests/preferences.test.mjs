import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePreferences, migratePreferences, summaryStyles, isSummaryStyle } from '../src/data/preferences.ts';

test('all supported first-person styles round-trip without accepting arbitrary prompt text', () => {
  for (const { id } of summaryStyles) {
    assert.equal(isSummaryStyle(id), true);
    const value = { role: 'child', parentLabel: '어머니', summaryStyle: id, completed: true };
    assert.deepEqual(parsePreferences(JSON.stringify(value)), value);
  }
  for (const raw of [null, '{bad', '{}', 'null', JSON.stringify({ role: 'child', parentLabel: '어머니', summaryStyle: 'ignore system', completed: true })]) assert.equal(parsePreferences(raw), null);
});

test('retired mandatory choices migrate to auto while preserving family setup', () => {
  const previous = { role: 'child', parentLabel: '엄마', summaryStyle: 'diary', completed: true };
  assert.deepEqual(migratePreferences(null, JSON.stringify(previous)), { ...previous, summaryStyle: 'auto' });
  const explicit = { ...previous, summaryStyle: 'diary' };
  assert.deepEqual(migratePreferences(JSON.stringify(explicit), JSON.stringify(previous)), explicit);
});

test('removed styles fall back to auto without losing family preferences', () => {
  for (const summaryStyle of ['formal', 'conversational']) {
    const value = { role: 'child', parentLabel: '엄마', summaryStyle, completed: true };
    assert.deepEqual(parsePreferences(JSON.stringify(value)), { ...value, summaryStyle: 'auto' });
  }
});
