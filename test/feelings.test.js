const test = require('node:test');
const assert = require('node:assert');
const { detectFeeling, isQuestion } = require('../feelings');

test('joy', () => {
  for (const t of ['yay', 'YAAAAY!!', 'woohoo I did it', 'let\'s go 🎉', 'this is amazing', 'it works!!']) {
    assert.strictEqual(detectFeeling(t), 'joy', t);
  }
});

test('angry', () => {
  for (const t of ['ugh', 'I hate this', 'this stupid thing doesn\'t work', 'wtf 😡', 'uuuugh it is broken again',
    'I love how this stupid thing broke']) {
    assert.strictEqual(detectFeeling(t), 'angry', t);
  }
});

test('sad', () => {
  for (const t of ['I am so tired', 'bad day 😢', 'not great']) assert.strictEqual(detectFeeling(t), 'sad', t);
});

test('neutral things stay neutral', () => {
  for (const t of ['remind me about the dentist', 'the meeting is at 3', '']) assert.strictEqual(detectFeeling(t), null, t);
  assert.strictEqual(isQuestion('why is the sky blue?'), true);
  assert.strictEqual(isQuestion('yay'), false);
});
