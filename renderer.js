/* global buddy */
const $ = (id) => document.getElementById(id);
const root = document.documentElement;
const ballWrap = $('ball-wrap');
const squashEl = $('ball-squash');
const eyes = $('eyes');
const pupils = document.querySelectorAll('.pupil');
const bubble = $('bubble');
const bubbleText = $('bubble-text');
const form = $('remind-form');
const askForm = $('ask-form');
const calForm = $('cal-form');
const joinBtn = $('bubble-join');
const forms = { remind: form, ask: askForm, calendar: calForm };

let mode = 'bounce';
let night = false;
let sounds = true;
let current = null; // message on screen
let queue = [];
let hideTimer = null;
let squashTimer = null;
let stretch = 1;

// ---------- mood ----------

function baseMood() {
  if (mode === 'sleep') return 'sleep';
  if (night) return 'sleepy';
  return 'happy';
}

let flashMood = null;
let flashTimer = null;
function flash(mood, ms) {
  flashMood = mood;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    flashMood = null;
    renderMood();
  }, ms);
  renderMood();
}

function renderMood() {
  const mood = flashMood || (current && current.mood) || baseMood();
  document.body.dataset.mood = mood;
}

// ---------- eyes ----------

buddy.on('look', ({ dx, dy, vy }) => {
  const dist = Math.hypot(dx, dy) || 1;
  const reach = Math.min(1, dist / 160) * 3.5;
  const px = (dx / dist) * reach;
  const py = (dy / dist) * reach;
  pupils.forEach((p) => p.setAttribute('transform', `translate(${px.toFixed(2)} ${py.toFixed(2)})`));

  // stretch while flying, unless a squash is playing
  if (!squashTimer) {
    const s = vy ? Math.min(Math.abs(vy) / 45, 0.16) : 0;
    if (Math.abs(s - (stretch - 1)) > 0.01) {
      stretch = 1 + s;
      squashEl.style.transform = `scale(${(1 - s * 0.6).toFixed(3)}, ${stretch.toFixed(3)})`;
    }
  }
});

function blinkLoop() {
  const mood = document.body.dataset.mood;
  if (mood !== 'sleep' && mood !== 'excited' && mood !== 'love') {
    eyes.classList.add('blink');
    setTimeout(() => eyes.classList.remove('blink'), 110);
    // sometimes a double blink
    if (Math.random() < 0.2) {
      setTimeout(() => eyes.classList.add('blink'), 220);
      setTimeout(() => eyes.classList.remove('blink'), 330);
    }
  }
  setTimeout(blinkLoop, 2000 + Math.random() * 4500);
}

buddy.on('squash', (s) => {
  const k = 0.12 + s * 0.28;
  squashEl.style.transform = `scale(${1 + k}, ${1 - k})`;
  clearTimeout(squashTimer);
  squashTimer = setTimeout(() => {
    squashEl.style.transform = 'scale(1, 1)';
    stretch = 1;
    squashTimer = null;
  }, 90);
});

// ---------- sounds ----------

let audio;
function beep(kind) {
  if (!sounds || !kind) return;
  try {
    audio = audio || new AudioContext();
    const notes = {
      alert: [[660, 0], [880, 0.14], [660, 0.28], [880, 0.42]],
      happy: [[523, 0], [659, 0.09], [784, 0.18]],
      poke: [[900, 0]],
    }[kind] || [];
    for (const [freq, at] of notes) {
      const t = audio.currentTime + at;
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(freq, t);
      if (kind === 'poke') o.frequency.exponentialRampToValueAtTime(1500, t + 0.08);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
      o.connect(g).connect(audio.destination);
      o.start(t);
      o.stop(t + 0.15);
    }
  } catch {
    /* no audio, no problem */
  }
}

// ---------- speech bubble ----------

function reportBubble() {
  requestAnimationFrame(() => {
    const openForm = Object.values(forms).find((f) => !f.classList.contains('hidden'));
    const el = openForm || (!bubble.classList.contains('hidden') ? bubble : null);
    if (!el) return buddy.send('bubble-rect', null);
    const r = el.getBoundingClientRect();
    return buddy.send('bubble-rect', { x: r.left, y: r.top, w: r.width, h: r.height + 10 });
  });
}

function show(msg) {
  current = msg;
  clearTimeout(hideTimer);
  bubbleText.textContent = msg.text;
  // One button per bubble: "Join call" for meetings, or e.g. "Drank it 💧".
  const btn = msg.link ? { label: 'Join call' } : msg.button;
  joinBtn.classList.toggle('hidden', !btn);
  if (btn) joinBtn.textContent = btn.label;
  bubbleText.scrollTop = 0;
  bubble.classList.toggle('sticky', !!msg.sticky);
  bubble.classList.toggle('long', msg.text.length > 90);
  bubble.classList.remove('hidden');
  // restart the pop animation
  bubble.style.animation = 'none';
  void bubble.offsetWidth;
  bubble.style.animation = '';
  beep(msg.sound);
  if (!msg.sticky) hideTimer = setTimeout(next, msg.duration || 6000);
  buddy.send('alerting', !!msg.sticky && msg.mood === 'alert');
  renderMood();
  reportBubble();
}

function next() {
  clearTimeout(hideTimer);
  current = null;
  // sticky messages that are waiting jump the queue
  const i = queue.findIndex((m) => m.sticky);
  const m = i >= 0 ? queue.splice(i, 1)[0] : queue.shift();
  if (m) return show(m);
  bubble.classList.add('hidden');
  buddy.send('alerting', false);
  renderMood();
  return reportBubble();
}

buddy.on('say', (msg) => {
  if (msg.key) {
    queue = queue.filter((m) => m.key !== msg.key);
    if (current && current.key === msg.key) return show(msg);
  }
  // Anything replaces a casual line; nothing interrupts something important,
  // except an answer to something you just asked (the other message waits).
  if (!current || !current.sticky) return show(msg);
  if (msg.urgent) {
    queue.unshift(current);
    return show(msg);
  }
  queue.push(msg);
  return undefined;
});

buddy.on('dismiss', (key) => {
  queue = queue.filter((m) => m.key !== key);
  if (current && current.key === key) next();
});

bubble.addEventListener('mousedown', (e) => {
  e.stopPropagation();
  if (e.button !== 0) return;
  if (e.target === joinBtn && current) {
    if (current.link) buddy.send('open-link', current.link);
    else if (current.button) buddy.send('bubble-action', current.button.action);
  }
  next();
});

// ---------- ball interaction ----------

let pokes = [];
buddy.on('poked', () => {
  if (current && current.sticky) {
    next();
    return;
  }
  const now = Date.now();
  pokes = pokes.filter((t) => now - t < 3000).concat(now);
  ballWrap.classList.remove('poke');
  void ballWrap.offsetWidth;
  ballWrap.classList.add('poke');
  beep('poke');
  if (mode === 'sleep') {
    flash('surprised', 1200);
    return;
  }
  if (pokes.length >= 6) flash('sad', 1500);
  else if (pokes.length >= 3) flash('love', 1500);
  else flash(Math.random() < 0.5 ? 'excited' : 'surprised', 900);
});

ballWrap.addEventListener('dblclick', () => buddy.send('open-ask'));

ballWrap.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  buddy.send('drag-start', { x: e.clientX, y: e.clientY });
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) buddy.send('drag-end');
});
window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  buddy.send('menu');
});

// ---------- reminder + ask forms ----------

buddy.on('open-form', (kind) => {
  Object.values(forms).forEach((f) => f.classList.add('hidden'));
  bubble.classList.add('hidden');
  if (kind === 'ask') {
    askForm.classList.remove('hidden');
    $('ask-text').value = '';
    $('ask-text').focus();
  } else if (kind === 'calendar') {
    calForm.classList.remove('hidden');
    $('cal-error').textContent = '';
    $('cal-url').value = '';
    $('cal-url').focus();
  } else {
    form.classList.remove('hidden');
    $('remind-error').textContent = '';
    $('remind-text').value = '';
    $('remind-when').value = '';
    $('remind-text').focus();
  }
  reportBubble();
});

function closeForm() {
  Object.values(forms).forEach((f) => f.classList.add('hidden'));
  buddy.send('form-closed');
  if (current) bubble.classList.remove('hidden');
  reportBubble();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = $('remind-text').value.trim();
  const when = $('remind-when').value.trim();
  if (!text) return $('remind-text').focus();
  if (!when) return $('remind-when').focus();
  const res = await buddy.addReminder(text, when);
  if (!res.ok) {
    $('remind-error').textContent = 'Hmm, try "10m", "1h30", "14:30" or "2pm"';
    return $('remind-when').focus();
  }
  return closeForm();
});

askForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const q = $('ask-text').value.trim();
  if (!q) return $('ask-text').focus();
  closeForm();
  return buddy.send('ask', q);
});

calForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = $('cal-url').value.trim();
  if (!url) return $('cal-url').focus();
  const btn = calForm.querySelector('button');
  btn.disabled = true;
  $('cal-error').textContent = '';
  const res = await buddy.addCalendar(url);
  btn.disabled = false;
  if (!res.ok) {
    $('cal-error').textContent = res.error;
    reportBubble();
    return $('cal-url').focus();
  }
  return closeForm();
});

$('cal-help').addEventListener('click', (e) => {
  e.preventDefault();
  buddy.send('open-link', 'https://support.google.com/calendar/answer/37648?hl=en#zippy=%2Cget-your-calendar-view-only');
});

Object.values(forms).forEach((f) => {
  f.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeForm();
  });
  f.addEventListener('mousedown', (e) => e.stopPropagation());
});

// ---------- state from main ----------

buddy.on('mode', (m) => {
  mode = m;
  renderMood();
});
// ---------- typing: heat level 0-3 from main ----------

const sparksEl = $('sparks');
function spark() {
  const s = document.createElement('span');
  s.className = 'spark';
  s.style.left = `${(Math.random() - 0.5) * 22}px`;
  s.style.setProperty('--dx', `${(Math.random() - 0.5) * 26}px`);
  s.style.setProperty('--dur', `${0.6 + Math.random() * 0.6}s`);
  if (Math.random() < 0.4) s.style.background = '#ff6a3d';
  sparksEl.appendChild(s);
  s.addEventListener('animationend', () => s.remove());
}

let sparkTimer = null;
buddy.on('typing', (level) => {
  const lv = Number(level) || 0;
  document.body.dataset.typing = String(lv);
  // the flame's tips sway faster the harder you type
  $('sway').setAttribute('dur', ['2.6s', '1.4s', '0.9s', '0.55s'][lv] || '2.6s');
  clearInterval(sparkTimer);
  sparkTimer = lv >= 2 ? setInterval(spark, lv >= 3 ? 140 : 380) : null;
});
buddy.on('sparks', (n) => {
  for (let i = 0; i < Math.min(Number(n) || 0, 30); i += 1) setTimeout(spark, i * 40);
});
buddy.on('night', (n) => {
  night = n;
  renderMood();
});
// ---------- holiday outfits ----------

// Which outfit fits today's date (month is 1-12).
function holidayOutfit(d = new Date()) {
  const m = d.getMonth() + 1;
  const day = d.getDate();
  if (m === 10) return 'halloween';
  if ((m === 12 && day === 31) || (m === 1 && day <= 2)) return 'newyear';
  if (m === 12 && day <= 26) return 'christmas';
  if (m === 2 && day >= 10 && day <= 14) return 'valentine';
  return 'none';
}

let outfitSetting = 'auto';
function applyOutfit() {
  document.body.dataset.outfit = outfitSetting === 'auto' ? holidayOutfit() : outfitSetting;
}
setInterval(applyOutfit, 30 * 60000); // pick up a new day

buddy.on('config', (c) => {
  sounds = c.sounds !== false;
  if (c.color) root.style.setProperty('--body', c.color);
  outfitSetting = c.outfit || 'auto';
  applyOutfit();
});

renderMood();
blinkLoop();
