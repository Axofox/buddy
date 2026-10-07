// Today's little stats for the daily recap. A "day" runs from 04:00 to
// 04:00, so a late night still counts as the same day.

const FIELDS = ['typingMs', 'waters', 'breaks', 'meetings', 'reminders', 'claude'];

function dayKey(now = new Date()) {
  const d = new Date(now.getTime() - 4 * 3600000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function emptyDay(key) {
  const day = { day: key };
  for (const f of FIELDS) day[f] = 0;
  return day;
}

// Returns today's stats object, starting a fresh one when the day changed.
function today(stats, now = new Date()) {
  const key = dayKey(now);
  return stats && stats.day === key ? stats : emptyDay(key);
}

function hm(ms) {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function recapText(s, { final = true } = {}) {
  const parts = [];
  if (s.typingMs >= 60000) parts.push(`${hm(s.typingMs)} typing`);
  parts.push(plural(s.waters, 'water', 'waters'));
  parts.push(plural(s.breaks, 'break', 'breaks'));
  if (s.meetings) parts.push(plural(s.meetings, 'meeting', 'meetings'));
  if (s.reminders) parts.push(plural(s.reminders, 'reminder', 'reminders'));
  if (s.claude) parts.push(`Claude finished ${plural(s.claude, 'task', 'tasks')}`);

  let end;
  if (!final) end = 'Keep going ✨';
  else if (s.waters >= 4 && s.breaks >= 2) end = 'You took good care of yourself today 💛';
  else if (s.typingMs >= 4 * 3600000) end = 'Big day! Rest well 🌙';
  else if (s.waters < 2) end = 'Good day ✨ Drink a bit more water tomorrow? 💧';
  else end = 'Good day ✨';
  return `${final ? 'Today' : 'So far today'}: ${parts.join(' · ')}. ${end}`;
}

module.exports = { dayKey, today, recapText, hm };
