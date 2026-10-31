const test = require('node:test');
const assert = require('node:assert');
const { inMiddle, pickTarget } = require('../roam');

test('the middle of the screen is off limits', () => {
  assert.strictEqual(inMiddle(720, 0, 1440), true);
  assert.strictEqual(inMiddle(100, 0, 1440), false);
  assert.strictEqual(inMiddle(1400, 0, 1440), false);
});

test('from the middle it heads to the nearer edge; at an edge it stays there', () => {
  for (let i = 0; i < 200; i += 1) {
    const o = { rand: Math.random, cross: 0 };
    assert.ok(pickTarget(600, 0, 1440, o) <= 1440 * 0.18 + 1e-9);
    assert.ok(pickTarget(900, 0, 1440, o) >= 1440 * 0.82 - 1e-9);
    assert.ok(pickTarget(50, 0, 1440, o) <= 1440 * 0.18 + 1e-9);
    assert.ok(pickTarget(1430, 0, 1440, o) >= 1440 * 0.82 - 1e-9);
  }
});

test('from an edge it sometimes jumps clear across to the other side', () => {
  // rand() = 0 is below the cross chance, so it crosses.
  assert.ok(pickTarget(50, 0, 1440, { rand: () => 0 }) >= 1440 * 0.82);
  assert.ok(pickTarget(1430, 0, 1440, { rand: () => 0 }) <= 1440 * 0.18);
  // rand() close to 1 stays on the same side.
  assert.ok(pickTarget(50, 0, 1440, { rand: () => 0.99 }) <= 1440 * 0.18);
  // From the middle it never crosses, whatever the dice say.
  assert.ok(pickTarget(600, 0, 1440, { rand: () => 0 }) <= 1440 * 0.18);
});

test('works on a second screen to the right', () => {
  const t = pickTarget(1500, 1440, 2880, { rand: () => 0.5 });
  assert.ok(t > 1440 && t < 1440 + 1440 * 0.18);
});
