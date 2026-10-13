// Connects Claude Code (on this computer) to Buddy by adding hooks to
// ~/.claude/settings.json: when Claude needs you, finishes, or you reply,
// Claude Code sends the event to Buddy's local server.
//
// The hook uses curl (built into macOS), so it works from the Buddy app too,
// without Node or the project folder. Everything else in the file is kept.

const EVENTS = ['Notification', 'Stop', 'UserPromptSubmit'];
const MARK = '# buddy';

function hookCommand(port) {
  // Reads the event from stdin and forwards it; never fails or slows Claude down.
  return `curl -s -m 2 --noproxy '*' -X POST http://127.0.0.1:${port}/claude -H 'Content-Type: application/json' `
    + `--data-binary @- >/dev/null 2>&1 || true ${MARK}`;
}

// Ours: added by this button, or by hand from the README (notify.js).
const isBuddyHook = (h) => h && typeof h.command === 'string'
  && (h.command.includes(MARK) || /\bnotify\.js\b/.test(h.command));

function hasBuddyHooks(settings) {
  const hooks = (settings && settings.hooks) || {};
  return EVENTS.every((ev) => (hooks[ev] || []).some((g) => (g.hooks || []).some(isBuddyHook)));
}

// Returns a copy without any Buddy hooks (other hooks stay as they were).
function removeBuddyHooks(settings) {
  const out = JSON.parse(JSON.stringify(settings || {}));
  if (!out.hooks) return out;
  for (const ev of Object.keys(out.hooks)) {
    if (!Array.isArray(out.hooks[ev])) continue;
    out.hooks[ev] = out.hooks[ev]
      .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !isBuddyHook(h)) }))
      .filter((g) => g.hooks.length);
    if (!out.hooks[ev].length) delete out.hooks[ev];
  }
  if (!Object.keys(out.hooks).length) delete out.hooks;
  return out;
}

// Returns a copy with exactly one Buddy hook per event.
function addBuddyHooks(settings, port) {
  const out = removeBuddyHooks(settings);
  out.hooks = out.hooks || {};
  for (const ev of EVENTS) {
    out.hooks[ev] = [...(out.hooks[ev] || []), { hooks: [{ type: 'command', command: hookCommand(port) }] }];
  }
  return out;
}

module.exports = {
  EVENTS, hookCommand, hasBuddyHooks, addBuddyHooks, removeBuddyHooks,
};
