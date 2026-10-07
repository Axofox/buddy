// Small, testable pieces of "how is the human doing" logic.

// ---------------------------------------------------------------------------
// Distraction: is the thing on screen a time sink?

const NICE_NAMES = {
  'youtube.com': 'YouTube',
  'instagram.com': 'Instagram',
  'tiktok.com': 'TikTok',
  'facebook.com': 'Facebook',
  'x.com': 'X',
  'twitter.com': 'Twitter',
  'reddit.com': 'Reddit',
  'netflix.com': 'Netflix',
  'twitch.tv': 'Twitch',
  'pinterest.com': 'Pinterest',
};

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

// activity: { app, url, title }. Returns a friendly label ("YouTube") or null.
function matchDistraction(activity, { sites = [], apps = [] } = {}) {
  if (!activity) return null;
  const host = hostOf(activity.url || '');
  const title = (activity.title || '').toLowerCase();
  for (const site of sites) {
    const s = String(site).toLowerCase().replace(/^www\./, '');
    if (!s) continue;
    const hit = host
      ? host === s || host.endsWith(`.${s}`)
      // No URL (e.g. Linux, Firefox): fall back to the window title.
      : title.includes((NICE_NAMES[s] || s.split('.')[0]).toLowerCase());
    if (hit) return NICE_NAMES[s] || s;
  }
  const app = (activity.app || '').toLowerCase();
  for (const a of apps) {
    if (a && app === String(a).toLowerCase()) return a;
  }
  return null;
}

// Adds up time spent on distractions. Short hops away (under `graceMs`) don't
// reset the count, so flicking to another tab and back still counts.
// sample() returns { label, minutes } when it's time for a nudge.
class FocusTracker {
  constructor({ afterMinutes = 30, repeatMinutes = 15, graceMs = 3 * 60000 } = {}) {
    this.afterMs = afterMinutes * 60000;
    this.repeatMs = Math.max(repeatMinutes, 1) * 60000;
    this.graceMs = graceMs;
    this.reset();
  }

  reset() {
    this.spent = 0;
    this.nudges = 0;
    this.label = null;
    this.offSince = null;
    this.last = null;
  }

  sample(now, label) {
    const dt = this.last === null ? 0 : Math.min(now - this.last, 60000);
    this.last = now;
    if (!label) {
      if (this.offSince === null) this.offSince = now;
      if (now - this.offSince >= this.graceMs) {
        this.spent = 0;
        this.nudges = 0;
      }
      return null;
    }
    this.offSince = null;
    this.spent += dt;
    this.label = label;
    const dueAt = this.afterMs + this.nudges * this.repeatMs;
    if (this.afterMs > 0 && this.spent >= dueAt) {
      this.nudges += 1;
      return { label, minutes: Math.round(this.spent / 60000) };
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Typing: we can't (and don't want to) read keys. Instead we notice "input is
// happening but the mouse isn't moving", which is almost always the keyboard.

class TypingTracker {
  constructor({ windowSize = 20, threshold = 0.5, sessionGapMs = 3 * 60000, milestones = [10, 25, 45, 90] } = {}) {
    this.windowSize = windowSize;
    this.threshold = threshold;
    this.sessionGapMs = sessionGapMs;
    this.milestones = milestones;
    this.samples = [];
    this.typing = false;
    this.sessionMs = 0;
    this.reached = 0;
    this.lastTypingAt = 0;
    this.last = null;
  }

  // inputNow: there was keyboard/mouse input in the last second.
  // mouseMoved: the cursor moved since the previous sample.
  // Returns { typing, changed, milestone } (milestone in minutes, or null).
  sample(now, inputNow, mouseMoved) {
    const dt = this.last === null ? 0 : Math.min(now - this.last, 5000);
    this.last = now;
    this.samples.push(inputNow && !mouseMoved ? 1 : 0);
    if (this.samples.length > this.windowSize) this.samples.shift();
    const rate = this.samples.reduce((a, b) => a + b, 0) / this.windowSize;

    const was = this.typing;
    // A little hysteresis so it doesn't flicker on and off.
    this.typing = was ? rate >= this.threshold * 0.6 : rate >= this.threshold;

    let milestone = null;
    if (this.typing) {
      if (now - this.lastTypingAt > this.sessionGapMs) {
        this.sessionMs = 0;
        this.reached = 0;
      }
      this.lastTypingAt = now;
      this.sessionMs += dt;
      const next = this.milestones[this.reached];
      if (next !== undefined && this.sessionMs >= next * 60000) {
        this.reached += 1;
        milestone = next;
      }
    }
    return { typing: this.typing, changed: was !== this.typing, milestone };
  }
}

module.exports = { matchDistraction, FocusTracker, TypingTracker, hostOf };
