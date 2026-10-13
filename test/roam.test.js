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
    const r = Math.random;
    assert.ok(pickTarget(600, 0, 1440, { rand: r }) <= 1440 * 0.18 + 1e-9);
    assert.ok(pickTarget(900, 0, 1440, { rand: r }) >= 1440 * 0.82 - 1e-9);
    assert.ok(pickTarget(50, 0, 1440, { rand: r }) <= 1440 * 0.18 + 1e-9);
    assert.ok(pickTarget(1430, 0, 1440, { rand: r }) >= 1440 * 0.82 - 1e-9);
  }
});

test('works on a second screen to the right', () => {
  const t = pickTarget(1500, 1440, 2880, { rand: () => 0.5 });
  assert.ok(t > 1440 && t < 1440 + 1440 * 0.18);
});
