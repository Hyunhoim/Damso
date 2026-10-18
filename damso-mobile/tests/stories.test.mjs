import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeStory, parseRoomMessage, questions } from '../src/data/stories.ts';

test('local stories retain the original answer and use Korean calendar dates', () => {
  const now = new Date('2026-10-18T16:00:00Z');
  const story = makeStory('  어머니와 밥을 먹었어요.\n즐거웠어요.  ', 'child', now);
  assert.equal(story.text, '어머니와 밥을 먹었어요.\n즐거웠어요.');
  assert.equal(story.date, '2026-10-19');
  assert.equal(story.author, 'child');
  assert.equal(story.sample, false);
  assert.notEqual(questions.parent, questions.child);
  assert.throws(() => makeStory('  ', 'parent'));
  assert.throws(() => makeStory('a'.repeat(2001), 'parent'));
  assert.throws(() => makeStory('기억', 'unknown'));
});
test('only the two known 3D bridge events are accepted', () => {
  assert.equal(parseRoomMessage('{"type":"damso-room-ready"}'), 'ready');
  assert.equal(parseRoomMessage({ type: 'damso-room-error' }), 'error');
  for (const value of ['not JSON', '{}', 'null', { type: 'run-command' }, null, 12]) assert.equal(parseRoomMessage(value), null);
});
