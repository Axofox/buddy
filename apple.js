// Apple Calendar + Reminders, through the small Swift helper in helpers/.
// `npm run app` compiles the helper into Buddy.app; when running with
// `npm start` on a Mac it's compiled on first use (needs Xcode's command line
// tools, which git already installed).

const { execFile, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { meetingLink } = require('./calendar');

const SRC = path.join(__dirname, 'helpers', 'eventkit.swift');
const PLIST = path.join(__dirname, 'helpers', 'eventkit-Info.plist');
const NAME = 'buddy-eventkit';

// Compiles the helper. The Info.plist is baked into the binary so macOS can
// show why Buddy is asking for access.
function compileHelper(out) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  execFileSync('swiftc', [
    '-O', '-swift-version', '5', SRC, '-o', out,
    '-Xlinker', '-sectcreate', '-Xlinker', '__TEXT', '-Xlinker', '__info_plist', '-Xlinker', PLIST,
  ], { stdio: 'pipe' });
  return out;
}

const isFile = (p) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};

// Where the helper is: inside the built app, freshly compiled for `npm start`,
// or BUDDY_EVENTKIT_HELPER (used by the tests).
function findHelper({ packaged, resourcesPath, userData }) {
  if (process.env.BUDDY_EVENTKIT_HELPER) return process.env.BUDDY_EVENTKIT_HELPER;
  if (process.platform !== 'darwin') return null;
  if (packaged) {
    const p = path.join(resourcesPath, NAME);
    return isFile(p) ? p : null;
  }
  const out = path.join(userData, 'bin', NAME);
  try {
    if (!isFile(out) || fs.statSync(out).mtimeMs < fs.statSync(SRC).mtimeMs) compileHelper(out);
    return out;
  } catch {
    return null;
  }
}

class AccessDenied extends Error {}

function runHelper(bin, args) {
  return new Promise((resolve, reject) => {
    // Generous timeout: the first run waits for you to answer the permission prompt.
    execFile(bin, args, { timeout: 180000 }, (err, stdout) => {
      let data = null;
      try {
        data = JSON.parse(String(stdout).trim().split('\n').pop());
      } catch {
        /* handled below */
      }
      if (data && data.error === 'denied') return reject(new AccessDenied('denied'));
      if (data && data.error) return reject(new Error(data.error));
      if (err || !Array.isArray(data)) return reject(new Error(err ? err.message : 'no answer from the calendar helper'));
      return resolve(data);
    });
  });
}

// Same shape as calendar.js meetings: { id, title, start, end, link }.
function toMeetings(events) {
  return events
    .filter((e) => Number.isFinite(e.start))
    .map((e) => ({
      id: `apple:${e.id}@${e.start}`,
      title: (e.title || 'Meeting').trim(),
      start: e.start,
      end: Number.isFinite(e.end) ? e.end : e.start,
      link: meetingLink({ url: e.url || '', location: e.location || '', notes: e.notes || '' }),
    }));
}

function toReminders(items) {
  return items
    .filter((r) => Number.isFinite(r.due))
    .map((r) => ({ id: `${r.id}@${r.due}`, title: (r.title || 'Reminder').trim(), due: r.due }));
}

async function appleMeetings(bin, from, to) {
  return toMeetings(await runHelper(bin, ['events', String(from.getTime()), String(to.getTime())]));
}

async function appleReminders(bin, from, to) {
  return toReminders(await runHelper(bin, ['reminders', String(from.getTime()), String(to.getTime())]));
}

// The same meeting can arrive twice (e.g. a Google calendar that's also in
// Apple Calendar): keep one per title + start time, preferring one with a link.
function mergeMeetings(...lists) {
  const byKey = new Map();
  for (const m of lists.flat()) {
    const key = `${m.title.toLowerCase()}|${m.start}`;
    const had = byKey.get(key);
    if (!had || (!had.link && m.link)) byKey.set(key, m);
  }
  return [...byKey.values()].sort((a, b) => a.start - b.start);
}

module.exports = {
  compileHelper, findHelper, appleMeetings, appleReminders, mergeMeetings, toMeetings, toReminders, AccessDenied, NAME,
};
