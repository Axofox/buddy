const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  toMeetings, toReminders, mergeMeetings, appleMeetings, appleReminders, AccessDenied,
} = require('../apple');

test('Apple events become meetings with call links', () => {
  const m = toMeetings([
    { id: 'A1', title: ' Standup ', start: 1000, end: 2000, location: '', notes: 'Join: https://meet.google.com/abc-defg-hij', url: '' },
    { id: 'A2', title: 'Dentist', start: 3000, end: 4000, location: 'Main St 1', notes: '', url: '' },
    { id: 'bad', title: 'x', start: null },
  ]);
  assert.deepStrictEqual(m.map((x) => [x.title, x.link]), [['Standup', 'https://meet.google.com/abc-defg-hij'], ['Dentist', '']]);
  assert.strictEqual(m[0].id, 'apple:A1@1000');
});

test('reminders keep a due time', () => {
  assert.deepStrictEqual(toReminders([{ id: 'R', title: 'Call mom', due: 5 }, { id: 'X', title: 'no time' }]),
    [{ id: 'R@5', title: 'Call mom', due: 5 }]);
});

test('the same meeting from two calendars shows once, keeping the link', () => {
  const merged = mergeMeetings(
    [{ id: 'g', title: 'Standup', start: 10, end: 20, link: '' }],
    [{ id: 'a', title: 'standup', start: 10, end: 20, link: 'https://zoom.us/j/1' }, { id: 'b', title: 'Lunch', start: 5, end: 6, link: '' }],
  );
  assert.deepStrictEqual(merged.map((m) => m.id), ['b', 'a']);
});

function fakeHelper(script) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'buddy-ek-'));
  const bin = path.join(dir, 'buddy-eventkit');
  fs.writeFileSync(bin, `#!/usr/bin/env node\n${script}\n`, { mode: 0o755 });
  return bin;
}

test('talks to the helper and handles "not allowed"', async () => {
  const ok = fakeHelper(`const [cmd, from] = process.argv.slice(2);
console.log(JSON.stringify(cmd === 'events'
  ? [{ id: 'E', title: 'Review', start: Number(from) + 60000, end: Number(from) + 120000, location: 'https://teams.microsoft.com/l/meetup-join/abc', notes: '', url: '' }]
  : [{ id: 'R', title: 'Water plants', due: Number(from) + 1000 }]));`);
  const from = new Date(1_000_000);
  const to = new Date(2_000_000);
  const ev = await appleMeetings(ok, from, to);
  assert.strictEqual(ev[0].title, 'Review');
  assert.strictEqual(ev[0].start, 1_060_000);
  assert.strictEqual(ev[0].link, 'https://teams.microsoft.com/l/meetup-join/abc');
  const rem = await appleReminders(ok, from, to);
  assert.strictEqual(rem[0].title, 'Water plants');

  const denied = fakeHelper('console.log(JSON.stringify({ error: "denied" })); process.exit(2);');
  await assert.rejects(appleMeetings(denied, from, to), AccessDenied);
  const broken = fakeHelper('console.log("not json"); process.exit(1);');
  await assert.rejects(appleMeetings(broken, from, to), (e) => !(e instanceof AccessDenied));
});
