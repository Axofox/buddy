const test = require('node:test');
const assert = require('node:assert');
const { dayKey, today, recapText } = require('../day');

test('a day runs from 4 am to 4 am', () => {
  assert.strictEqual(dayKey(new Date(2026, 9, 7, 23, 30)), '2026-10-07');
  assert.strictEqual(dayKey(new Date(2026, 9, 8, 2, 0)), '2026-10-07'); // still "tonight"
  assert.strictEqual(dayKey(new Date(2026, 9, 8, 4, 1)), '2026-10-08');
});

test('a new day starts with fresh numbers', () => {
  const old = { day: '2026-10-06', waters: 5, breaks: 2, typingMs: 1, meetings: 0, reminders: 0, claude: 0 };
  const t = today(old, new Date(2026, 9, 7, 12));
  assert.strictEqual(t.day, '2026-10-07');
  assert.strictEqual(t.waters, 0);
  const same = today(t, new Date(2026, 9, 7, 18));
  assert.strictEqual(same, t);
});

test('recap reads nicely', () => {
  const s = { day: 'x', typingMs: (3 * 60 + 10) * 60000, waters: 4, breaks: 2, meetings: 2, reminders: 0, claude: 5 };
  assert.strictEqual(recapText(s),
    'Today: 3h 10m typing · 4 waters · 2 breaks · 2 meetings · Claude finished 5 tasks. You took good care of yourself today 💛');
  assert.strictEqual(recapText({ ...s, typingMs: 0, waters: 1, breaks: 1, meetings: 0, claude: 0 }),
    'Today: 1 water · 1 break. Good day ✨ Drink a bit more water tomorrow? 💧');
  assert.match(recapText(s, { final: false }), /^So far today: .* Keep going ✨$/);
});
