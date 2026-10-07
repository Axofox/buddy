// Meetings from calendar feeds (Google Calendar's "secret address in iCal
// format", or any other .ics link). Read-only: Buddy never changes anything.

const ical = require('node-ical');

// Video-call links we know how to spot, best first.
const LINKS = [
  /https:\/\/meet\.google\.com\/[a-z0-9-]+/i,
  /https:\/\/[\w.-]*zoom\.us\/(?:j|my|w|s)\/[^\s<>"'\\]+/i,
  /https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s<>"'\\]+/i,
  /https:\/\/teams\.live\.com\/meet\/[^\s<>"'\\]+/i,
  /https:\/\/[\w.-]*webex\.com\/[^\s<>"'\\]+/i,
  /https:\/\/whereby\.com\/[^\s<>"'\\]+/i,
];

const text = (v) => (typeof v === 'string' ? v : (v && typeof v.val === 'string' ? v.val : ''));

function meetingLink(ev) {
  // Google puts the Meet link in X-GOOGLE-CONFERENCE and the description;
  // Zoom & co. usually end up in the location or description.
  const haystack = Object.values(ev).map(text).filter(Boolean).join('\n');
  for (const re of LINKS) {
    const m = haystack.match(re);
    if (m) return m[0].replace(/[).,;]+$/, '');
  }
  return '';
}

// Turns .ics text into timed meetings that start between `from` and `to`.
// All-day events and cancelled events are skipped.
function parseMeetings(icsText, from, to) {
  const data = ical.sync.parseICS(icsText);
  const out = [];
  for (const ev of Object.values(data)) {
    if (!ev || ev.type !== 'VEVENT' || ev.recurrenceid) continue;
    let instances = [];
    try {
      instances = ical.expandRecurringEvent(ev, { from, to });
    } catch {
      continue; // one odd event shouldn't hide the rest
    }
    for (const inst of instances) {
      const e = inst.event || ev;
      if (inst.isFullDay || inst.start.dateOnly) continue;
      if (String(text(e.status)).toUpperCase() === 'CANCELLED') continue;
      const start = inst.start.getTime();
      if (start < from.getTime() || start > to.getTime()) continue;
      out.push({
        id: `${ev.uid || text(e.summary)}@${start}`,
        title: (text(inst.summary) || text(e.summary) || 'Meeting').trim(),
        start,
        end: inst.end ? inst.end.getTime() : start,
        link: meetingLink(e) || meetingLink(ev),
      });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

function normalizeUrl(url) {
  return String(url || '').trim().replace(/^webcal:\/\//i, 'https://');
}

async function fetchMeetings(url, from, to) {
  const res = await fetch(normalizeUrl(url), { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`the calendar answered ${res.status}`);
  const body = await res.text();
  if (!body.includes('BEGIN:VCALENDAR')) throw new Error('that link isn\'t a calendar (.ics) address');
  return parseMeetings(body, from, to);
}

module.exports = { parseMeetings, fetchMeetings, meetingLink, normalizeUrl };
