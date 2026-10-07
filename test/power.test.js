const test = require('node:test');
const assert = require('node:assert');
const { parsePmset, parseSysfs, BatteryWatcher, NetWatcher } = require('../power');

test('reads pmset output', () => {
  assert.deepStrictEqual(parsePmset(`Now drawing from 'Battery Power'
 -InternalBattery-0 (id=4653155)\t85%; discharging; 4:12 remaining present: true`), { percent: 85, plugged: false });
  assert.deepStrictEqual(parsePmset(`Now drawing from 'AC Power'
 -InternalBattery-0 (id=4653155)\t100%; charged; 0:00 remaining present: true`), { percent: 100, plugged: true });
  assert.deepStrictEqual(parsePmset(`Now drawing from 'AC Power'
 -InternalBattery-0 (id=1)\t80%; AC attached; not charging present: true`), { percent: 80, plugged: true });
  assert.strictEqual(parsePmset("Now drawing from 'AC Power'"), null); // a Mac without a battery
  assert.deepStrictEqual(parseSysfs('42\n', 'Discharging\n'), { percent: 42, plugged: false });
});

test('warns once per level while draining, then thanks you for plugging in', () => {
  const w = new BatteryWatcher();
  const run = (percent, plugged = false) => w.update({ percent, plugged });
  assert.strictEqual(run(50), null);
  assert.deepStrictEqual(run(20), { type: 'low', percent: 20, level: 20 });
  assert.strictEqual(run(19), null); // already warned at 20
  assert.deepStrictEqual(run(9), { type: 'low', percent: 9, level: 10 }); // jumped past 10
  assert.deepStrictEqual(run(4), { type: 'low', percent: 4, level: 5 });
  assert.deepStrictEqual(run(5, true), { type: 'plugged' });
  assert.strictEqual(run(60, true), null);
  assert.deepStrictEqual(run(100, true), { type: 'full' });
  assert.strictEqual(run(100, true), null); // only once
  assert.strictEqual(run(99), null); // unplugged, plenty left
  assert.deepStrictEqual(run(20), { type: 'low', percent: 20, level: 20 }); // new discharge warns again
});

test('no "fully charged" just because Buddy started on a full battery', () => {
  const w = new BatteryWatcher();
  assert.strictEqual(w.update({ percent: 100, plugged: true }), null);
  assert.strictEqual(w.update({ percent: 100, plugged: true }), null);
});

test('internet: ignores a single blip, announces drop and return once', () => {
  const n = new NetWatcher({ confirm: 2 });
  assert.strictEqual(n.update(false), null); // blip
  assert.strictEqual(n.update(true), null);
  assert.strictEqual(n.update(false), null);
  assert.strictEqual(n.update(false), 'offline');
  assert.strictEqual(n.update(false), null);
  assert.strictEqual(n.update(true), 'online');
  assert.strictEqual(n.update(true), null);
});
