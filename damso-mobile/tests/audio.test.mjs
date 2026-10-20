import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audioTime } from '../src/data/audio.ts';

test('audio time handles loading, invalid durations and replay boundaries', () => {
  assert.equal(audioTime(0), '0:00');
  assert.equal(audioTime(65.8), '1:05');
  assert.equal(audioTime(-3), '0:00');
  assert.equal(audioTime(NaN), '0:00');
  assert.equal(audioTime(Infinity), '0:00');
});
