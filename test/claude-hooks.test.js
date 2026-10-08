const test = require('node:test');
const assert = require('node:assert');
const {
  hasBuddyHooks, addBuddyHooks, removeBuddyHooks, hookCommand,
} = require('../claude-hooks');

const theirs = {
  model: 'opus',
  permissions: { allow: ['Bash(npm test)'] },
  hooks: {
    Stop: [{ hooks: [{ type: 'command', command: 'say done' }] }],
    PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: './check.sh' }] }],
  },
};

test('connecting adds one hook per event and keeps everything else', () => {
  const s = addBuddyHooks(theirs, 47321);
  assert.strictEqual(hasBuddyHooks(s), true);
  assert.strictEqual(s.model, 'opus');
  assert.deepStrictEqual(s.permissions, theirs.permissions);
  assert.deepStrictEqual(s.hooks.PreToolUse, theirs.hooks.PreToolUse);
  assert.strictEqual(s.hooks.Stop.length, 2); // theirs + ours
  assert.strictEqual(s.hooks.Stop[0].hooks[0].command, 'say done');
  assert.match(s.hooks.Notification[0].hooks[0].command, /127\.0\.0\.1:47321\/claude/);
  assert.deepStrictEqual(theirs.hooks.Stop.length, 1, 'input untouched');
});

test('connecting twice does not duplicate; a new port replaces the old hook', () => {
  const s = addBuddyHooks(addBuddyHooks(theirs, 47321), 50000);
  assert.strictEqual(s.hooks.Notification.length, 1);
  assert.match(s.hooks.Notification[0].hooks[0].command, /:50000\//);
});

test('disconnecting removes only Buddy hooks, including hand-made notify.js ones', () => {
  const manual = { hooks: { Stop: [{ hooks: [{ type: 'command', command: 'node /Users/x/buddy/notify.js' }] }] } };
  assert.deepStrictEqual(removeBuddyHooks(manual), {});
  assert.deepStrictEqual(removeBuddyHooks(addBuddyHooks(theirs, 47321)), theirs);
  assert.strictEqual(hasBuddyHooks({}), false);
});

test('the hook never fails Claude', () => {
  assert.match(hookCommand(47321), /\|\| true/);
  assert.match(hookCommand(47321), /-m 2/);
});
