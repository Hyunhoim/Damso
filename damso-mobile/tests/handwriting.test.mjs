import { test } from 'node:test';
import assert from 'node:assert/strict';
import { storyHandwriting, nextHandwriting } from '../src/data/handwriting.ts';
import { parseRoomMessage } from '../src/data/stories.ts';

test('story handwriting cycles through the three supplied fonts back to the fixed default', () => {
  assert.equal(storyHandwriting[0], 'StoryHandOne');
  assert.equal(storyHandwriting.length, 3);
  let index = 0;
  for (let i = 0; i < 3; i++) index = nextHandwriting(index);
  assert.equal(index, 0);
});
test('frame and book events map to fixed destinations, ignoring arbitrary URLs', () => {
  assert.equal(parseRoomMessage('{"type":"damso-open-album"}'), 'album');
  assert.equal(parseRoomMessage({ type: 'damso-open-library' }), 'library');
  assert.equal(parseRoomMessage({ type: 'open', url: 'https://example.com' }), null);
});
