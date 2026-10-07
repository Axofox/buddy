const test = require('node:test');
const assert = require('node:assert');
const { parseHidIdle } = require('../activity');
const { run, isFile } = require('../sys');

test('reads macOS input idle time from ioreg output', () => {
  const sample = '  | |   "HIDIdleTime" = 452000000\n  | |   "HIDParameters" = {}';
  assert.strictEqual(parseHidIdle(sample), 452);
  assert.strictEqual(parseHidIdle(''), null);
});

test('running commands never throws', async () => {
  assert.strictEqual(await run('node', ['-e', 'console.log("  hi  ")']), 'hi');
  assert.strictEqual(await run('definitely-not-a-command-xyz', []), '');
  assert.strictEqual(isFile(__filename), true);
  assert.strictEqual(isFile(__dirname), false);
});
