const test = require('node:test');
const assert = require('node:assert');
const { matchDistraction, FocusTracker, TypingTracker } = require('../habits');
const { cleanAnswer } = require('../ask');

const cfg = { sites: ['youtube.com', 'x.com'], apps: ['Steam'] };

test('matches distracting sites by URL, including subdomains', () => {
  assert.strictEqual(matchDistraction({ url: 'https://www.youtube.com/watch?v=1' }, cfg), 'YouTube');
  assert.strictEqual(matchDistraction({ url: 'https://m.youtube.com/' }, cfg), 'YouTube');
  assert.strictEqual(matchDistraction({ url: 'https://x.com/home' }, cfg), 'X');
  assert.strictEqual(matchDistraction({ url: 'https://notyoutube.com/' }, cfg), null);
  assert.strictEqual(matchDistraction({ url: 'https://github.com/' }, cfg), null);
});

test('falls back to window title, and matches apps', () => {
  assert.strictEqual(matchDistraction({ title: 'Cats - YouTube — Mozilla Firefox' }, cfg), 'YouTube');
  assert.strictEqual(matchDistraction({ app: 'Steam' }, cfg), 'Steam');
  assert.strictEqual(matchDistraction({ app: 'Terminal' }, cfg), null);
  assert.strictEqual(matchDistraction(null, cfg), null);
});

test('focus tracker nudges after the limit, then every repeat', () => {
  const t = new FocusTracker({ afterMinutes: 30, repeatMinutes: 15 });
  const nudges = [];
  for (let s = 0; s <= 50 * 60; s += 15) {
    const r = t.sample(s * 1000, 'YouTube');
    if (r) nudges.push(r.minutes);
  }
  assert.deepStrictEqual(nudges, [30, 45]);

  // a short hop away doesn't reset, a long one does
  const u = new FocusTracker({ afterMinutes: 10, repeatMinutes: 10 });
  let now = 0;
  const run = (mins, label) => {
    let hit = null;
    for (let i = 0; i < mins * 4; i += 1) {
      now += 15000;
      hit = u.sample(now, label) || hit;
    }
    return hit;
  };
  run(6, 'YouTube');
  run(1, null);
  assert.ok(run(5, 'YouTube'), 'should nudge: 11 min with a 1 min break');
  u.reset();
  run(6, 'YouTube');
  run(5, null);
  assert.strictEqual(run(6, 'YouTube'), null, 'a 5 min break starts over');
});

test('typing: keyboard input without mouse movement', () => {
  const t = new TypingTracker();
  let now = 0;
  let r;
  for (let i = 0; i < 20; i += 1) r = t.sample((now += 500), true, false);
  assert.strictEqual(r.typing, true);
  // moving the mouse around is not typing
  const m = new TypingTracker();
  for (let i = 0; i < 20; i += 1) r = m.sample((now += 500), true, true);
  assert.strictEqual(r.typing, false);
});

test('typing milestones fire once each', () => {
  const t = new TypingTracker({ milestones: [10, 25] });
  let now = 0;
  const hits = [];
  for (let i = 0; i < 30 * 120; i += 1) {
    const r = t.sample((now += 500), true, false);
    if (r.milestone) hits.push(r.milestone);
  }
  assert.deepStrictEqual(hits, [10, 25]);
});

test('answers are cleaned for the bubble', () => {
  assert.strictEqual(cleanAnswer('## Hi\n**Bold** move\n\n\n\nok\n'), 'Hi\nBold move\n\nok');
});

test('typing heats up: typing, fast, then on fire after 2 minutes', () => {
  const t = new TypingTracker();
  let now = 0;
  const levels = new Set();
  // fast, unbroken typing for 3 minutes
  for (let i = 0; i < 360; i += 1) levels.add(t.sample((now += 500), true, false).level);
  assert.deepStrictEqual([...levels].sort(), [0, 1, 2, 3]);
  assert.strictEqual(t.level, 3);
  // stop: back to 0 within a few seconds, and the streak starts over
  let r;
  for (let i = 0; i < 20; i += 1) r = t.sample((now += 500), false, false);
  assert.strictEqual(r.level, 0);
  for (let i = 0; i < 40; i += 1) r = t.sample((now += 500), true, false);
  assert.ok(r.level < 3, 'not on fire again right away');
});

test('reads macOS input idle time from ioreg output', () => {
  const { parseHidIdle } = require('../activity');
  const sample = '  | |   "HIDIdleTime" = 452000000\n  | |   "HIDParameters" = {}';
  assert.strictEqual(parseHidIdle(sample), 452);
  assert.strictEqual(parseHidIdle(''), null);
});
