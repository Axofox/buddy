const test = require('node:test');
const assert = require('node:assert');
const { parseMeetings, normalizeUrl } = require('../calendar');

// Shaped like Google Calendar's secret iCal feed.
const ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Google Inc//Google Calendar 70.9054//EN
BEGIN:VTIMEZONE
TZID:Europe/Vienna
BEGIN:STANDARD
DTSTART:19701025T030000
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:19700329T020000
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
END:VTIMEZONE
BEGIN:VEVENT
DTSTART;TZID=Europe/Vienna:20260901T093000
DTEND;TZID=Europe/Vienna:20260901T094500
RRULE:FREQ=WEEKLY;BYDAY=TU,WE
EXDATE;TZID=Europe/Vienna:20261013T093000
UID:standup@google.com
SUMMARY:Standup
DESCRIPTION:Join with Google Meet: https://meet.google.com/abc-defg-hij\\nOr dial
X-GOOGLE-CONFERENCE:https://meet.google.com/abc-defg-hij
STATUS:CONFIRMED
END:VEVENT
BEGIN:VEVENT
DTSTART:20261007T130000Z
DTEND:20261007T140000Z
UID:zoom@google.com
SUMMARY:Design review
LOCATION:https://us02web.zoom.us/j/123456789?pwd=abc
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20261007
DTEND;VALUE=DATE:20261008
UID:allday@google.com
SUMMARY:Holiday
END:VEVENT
BEGIN:VEVENT
DTSTART:20261007T150000Z
DTEND:20261007T160000Z
UID:cancelled@google.com
SUMMARY:Cancelled thing
STATUS:CANCELLED
END:VEVENT
BEGIN:VEVENT
DTSTART:20261007T170000Z
DTEND:20261007T173000Z
UID:dentist@google.com
SUMMARY:Dentist
END:VEVENT
END:VCALENDAR
`.replace(/\n/g, '\r\n');

test('reads timed meetings with their call links', () => {
  const from = new Date('2026-10-07T00:00:00Z');
  const to = new Date('2026-10-08T00:00:00Z');
  const m = parseMeetings(ICS, from, to);
  assert.deepStrictEqual(m.map((x) => x.title), ['Standup', 'Design review', 'Dentist']);
  // 09:30 Vienna summer time = 07:30 UTC
  assert.strictEqual(new Date(m[0].start).toISOString(), '2026-10-07T07:30:00.000Z');
  assert.strictEqual(m[0].link, 'https://meet.google.com/abc-defg-hij');
  assert.strictEqual(m[1].link, 'https://us02web.zoom.us/j/123456789?pwd=abc');
  assert.strictEqual(m[2].link, '');
  assert.notStrictEqual(m[0].id, m[1].id);
});

test('recurring meetings respect excluded dates and time zones', () => {
  const week = parseMeetings(ICS, new Date('2026-10-12T00:00:00Z'), new Date('2026-10-15T00:00:00Z'))
    .filter((x) => x.title === 'Standup');
  // Tue 13th is excluded, Wed 14th happens
  assert.deepStrictEqual(week.map((x) => new Date(x.start).toISOString()), ['2026-10-14T07:30:00.000Z']);
  // after the clocks change (25 Oct) it's 08:30 UTC
  const nov = parseMeetings(ICS, new Date('2026-11-03T00:00:00Z'), new Date('2026-11-04T00:00:00Z'));
  assert.strictEqual(new Date(nov[0].start).toISOString(), '2026-11-03T08:30:00.000Z');
});

test('webcal links become https', () => {
  assert.strictEqual(normalizeUrl(' webcal://calendar.google.com/x.ics '), 'https://calendar.google.com/x.ics');
});
