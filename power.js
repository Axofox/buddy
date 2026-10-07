// Battery and internet watching. No AI, no accounts: just the Mac's own
// battery report (`pmset`, Linux: /sys) and a tiny "am I online?" check.

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Reading the battery

// `pmset -g batt` looks like:
//   Now drawing from 'Battery Power'
//    -InternalBattery-0 (id=4653155)	85%; discharging; 4:12 remaining present: true
function parsePmset(text) {
  const t = String(text);
  const m = t.match(/(\d{1,3})%;\s*([^;]+);/);
  if (!m) return null; // no battery (e.g. an iMac or Mac mini)
  const state = m[2].trim().toLowerCase();
  return {
    percent: Number(m[1]),
    // "charged" and "AC attached; not charging" both mean plugged in.
    plugged: /ac power/i.test(t) || state === 'charging' || state === 'charged' || state === 'finishing charge',
  };
}

function parseSysfs(capacity, status) {
  const percent = Number(String(capacity).trim());
  if (!Number.isFinite(percent)) return null;
  return { percent, plugged: !/discharging/i.test(String(status)) };
}

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 5000 }, (err, out) => resolve(err ? '' : String(out)));
  });
}

async function readBattery() {
  if (process.platform === 'darwin') return parsePmset(await run('pmset', ['-g', 'batt']));
  if (process.platform === 'linux') {
    try {
      const base = '/sys/class/power_supply';
      const bat = fs.readdirSync(base).find((d) => /^BAT/i.test(d));
      if (!bat) return null;
      return parseSysfs(fs.readFileSync(path.join(base, bat, 'capacity'), 'utf8'),
        fs.readFileSync(path.join(base, bat, 'status'), 'utf8'));
    } catch {
      return null;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Deciding what to say

// Feed it battery readings; it returns at most one event per reading:
//   { type: 'low', percent, level }  crossed a warning level while unplugged
//   { type: 'plugged' }              plugged in after a warning
//   { type: 'full' }                 reached 100% while plugged in
class BatteryWatcher {
  constructor({ levels = [20, 10, 5] } = {}) {
    this.levels = [...levels].sort((a, b) => b - a);
    this.warnedAt = 101; // lowest level we've warned about this discharge
    this.wasPlugged = null;
    this.fullSaid = false;
  }

  update(b) {
    if (!b) return null;
    const first = this.wasPlugged === null;
    const plugged = b.plugged;
    this.wasPlugged = plugged;

    if (plugged) {
      const warned = this.warnedAt <= 100;
      this.warnedAt = 101;
      if (b.percent < 100) this.fullSaid = false;
      if (warned) return { type: 'plugged' };
      if (b.percent >= 100 && !this.fullSaid) {
        this.fullSaid = true;
        if (!first) return { type: 'full' }; // not at startup: it was probably full all along
      }
      return null;
    }

    this.fullSaid = false;
    // The lowest level we've now dropped to, if it's lower than the last warning.
    const level = this.levels.filter((l) => b.percent <= l).pop();
    if (level !== undefined && level < this.warnedAt) {
      this.warnedAt = level;
      return { type: 'low', percent: b.percent, level };
    }
    return null;
  }
}

// Feed it online/offline samples. Says 'offline' only after `confirm` bad
// samples in a row (so a short blip stays quiet), and 'online' only if we said
// 'offline' before.
class NetWatcher {
  constructor({ confirm = 2 } = {}) {
    this.confirm = confirm;
    this.badRun = 0;
    this.saidOffline = false;
  }

  update(online) {
    if (online) {
      this.badRun = 0;
      if (this.saidOffline) {
        this.saidOffline = false;
        return 'online';
      }
      return null;
    }
    this.badRun += 1;
    if (this.badRun >= this.confirm && !this.saidOffline) {
      this.saidOffline = true;
      return 'offline';
    }
    return null;
  }

  reset() {
    this.badRun = 0;
  }
}

// Is the internet reachable? The network adapter can be up while the internet
// is not (a dead router, a hotel login page), so we also try a tiny request to
// Apple's "is the internet working" page, the same one Macs use themselves.
async function isOnline(netModule) {
  if (netModule && typeof netModule.isOnline === 'function' && !netModule.isOnline()) return false;
  try {
    const res = await fetch('http://captive.apple.com/hotspot-detect.html', {
      method: 'GET', cache: 'no-store', signal: AbortSignal.timeout(6000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

module.exports = {
  parsePmset, parseSysfs, readBattery, BatteryWatcher, NetWatcher, isOnline,
};
