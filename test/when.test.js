const test = require('node:test');
const assert = require('node:assert');
const { parseWhen, formatWhen } = require('../when');

// Tuesday 7 Oct 2026, 10:00 local time
const now = new Date(2026, 9, 7, 10, 0, 0, 0);
const t = now.getTime();
const MIN = 60000;

test('relative times', () => {
  assert.equal(parseWhen('10m', now), t + 10 * MIN);
  assert.equal(parseWhen('10', now), t + 10 * MIN);
  assert.equal(parseWhen('in 20 minutes', now), t + 20 * MIN);
  assert.equal(parseWhen('1h', now), t + 60 * MIN);
  assert.equal(parseWhen('1h30', now), t + 90 * MIN);
  assert.equal(parseWhen('1h 30m', now), t + 90 * MIN);
  assert.equal(parseWhen('1.5 hours', now), t + 90 * MIN);
  assert.equal(parseWhen('90s', now), t + 90000);
});

test('clock times', () => {
  assert.equal(parseWhen('14:30', now), new Date(2026, 9, 7, 14, 30).getTime());
  assert.equal(parseWhen('2pm', now), new Date(2026, 9, 7, 14, 0).getTime());
  assert.equal(parseWhen('2:15 pm', now), new Date(2026, 9, 7, 14, 15).getTime());
  assert.equal(parseWhen('at 12am', now), new Date(2026, 9, 8, 0, 0).getTime());
  // already passed today -> tomorrow
  assert.equal(parseWhen('9:00', now), new Date(2026, 9, 8, 9, 0).getTime());
  assert.equal(parseWhen('tomorrow 9am', now), new Date(2026, 9, 8, 9, 0).getTime());
});

test('nonsense', () => {
  assert.equal(parseWhen('', now), null);
  assert.equal(parseWhen('banana', now), null);
  assert.equal(parseWhen('25:00', now), null);
  assert.equal(parseWhen('5 parsecs', now), null);
});

test('formatWhen', () => {
  assert.equal(formatWhen(new Date(2026, 9, 7, 14, 5).getTime(), now), '14:05');
  assert.equal(formatWhen(new Date(2026, 9, 8, 9, 0).getTime(), now), 'tomorrow 09:00');
});
