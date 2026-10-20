import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authorLabel, isParentLabel, parentLabels, storyHeading } from '../src/data/family.ts';

test('parent labels affect only the child viewer, keeping the author perspective intact', () => {
  for (const label of parentLabels) {
    assert.equal(isParentLabel(label), true);
    assert.equal(storyHeading('parent', 'child', label), `${label}의 이야기`);
    assert.equal(storyHeading('parent', 'parent', label), '나의 이야기');
    assert.equal(storyHeading('child', 'parent', label), '민수의 이야기');
    assert.equal(storyHeading('child', 'child', label), '나의 이야기');
  }
  assert.equal(authorLabel('parent', 'child', '어머니'), '어머니');
  for (const invalid of [null, undefined, '', '지영', ' 어머니 ', {}, 1]) assert.equal(isParentLabel(invalid), false);
});
