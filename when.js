// Turns things like "10m", "1h30", "in 20 minutes", "14:30", "2pm" or
// "tomorrow 9am" into a timestamp. Returns null when it can't make sense of it.

const UNITS = {
  s: 1000, sec: 1000, secs: 1000, second: 1000, seconds: 1000,
  m: 60000, min: 60000, mins: 60000, minute: 60000, minutes: 60000,
  h: 3600000, hr: 3600000, hrs: 3600000, hour: 3600000, hours: 3600000,
};

function parseWhen(input, now = new Date()) {
  if (!input) return null;
  let s = String(input).trim().toLowerCase();
  s = s.replace(/^in\s+/, '');

  // Bare number = minutes.
  if (/^\d+(\.\d+)?$/.test(s)) return now.getTime() + parseFloat(s) * 60000;

  // Relative: "1h30m", "1h 30", "90s", "1.5 hours", "20 minutes".
  const rel = /^(\d+(?:\.\d+)?)\s*([a-z]+)(?:\s*(\d+)\s*(m|min|mins|minutes?)?)?$/.exec(s);
  if (rel && UNITS[rel[2]]) {
    let ms = parseFloat(rel[1]) * UNITS[rel[2]];
    if (rel[3]) ms += parseInt(rel[3], 10) * 60000; // "1h30"
    return now.getTime() + ms;
  }

  // Absolute: "14:30", "2pm", "2:30 pm", optionally prefixed with "tomorrow" / "at".
  let tomorrow = false;
  s = s.replace(/^at\s+/, '');
  if (s.startsWith('tomorrow')) {
    tomorrow = true;
    s = s.replace(/^tomorrow\s*(at\s+)?/, '');
  }
  const abs = /^(\d{1,2})(?:[:.h](\d{2}))?\s*(am|pm)?$/.exec(s);
  if (!abs) return null;
  let hour = parseInt(abs[1], 10);
  const minute = abs[2] ? parseInt(abs[2], 10) : 0;
  const ampm = abs[3];
  if (!ampm && !abs[2]) return null; // "14" alone is ambiguous, already handled as minutes above
  if (ampm === 'pm' && hour < 12) hour += 12;
  if (ampm === 'am' && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;

  const at = new Date(now);
  at.setHours(hour, minute, 0, 0);
  if (tomorrow) at.setDate(at.getDate() + 1);
  else if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1);
  return at.getTime();
}

function pad(n) {
  return String(n).padStart(2, '0');
}

// "09:05"
function hhmm(ts) {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatWhen(ts, now = new Date()) {
  const d = new Date(ts);
  const hm = hhmm(d);
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return hm;
  const t = new Date(now);
  t.setDate(t.getDate() + 1);
  if (d.toDateString() === t.toDateString()) return `tomorrow ${hm}`;
  return `${d.toLocaleDateString()} ${hm}`;
}

// "HH:MM" -> minutes since midnight
function toMinutes(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + (m || 0);
}

module.exports = { parseWhen, formatWhen, toMinutes, hhmm };
