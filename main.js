const {
  app, BrowserWindow, screen, ipcMain, Menu, Notification, powerMonitor, shell, Tray, nativeImage,
  globalShortcut,
} = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { parseWhen, formatWhen, toMinutes } = require('./when');
const { matchDistraction, FocusTracker, TypingTracker } = require('./habits');
const { currentActivity } = require('./activity');
const { askClaude } = require('./ask');
const { fetchMeetings } = require('./calendar');

// ---------------------------------------------------------------------------
// Geometry: the window is a small transparent box. The ball sits at the bottom
// centre, the speech bubble floats above it (tall enough for Claude's answers).
const W = 260;
const H = 250;
const BALL = 48;
const BX = W / 2; // ball centre inside the window
const BY = H - BALL / 2 - 2;
const NEAR = 110; // px: closer than this, the buddy stops hopping so you can catch it
const NEAR_FOLLOW = 60; // same in Follow mode, where it normally sits ~55px from the cursor

const DEFAULT_CONFIG = {
  name: '', // what the buddy calls you, e.g. "Christine"
  port: 47321, // local HTTP port for Claude Code hooks and scripts
  color: '#ee5a3a',
  startMode: 'bounce', // bounce | follow | still | sleep
  morning: { from: '05:00', to: '11:30' },
  lunch: '12:30',
  dinner: '19:00', // set to "" to disable
  bedtime: '23:00',
  bedtimeUntil: '04:00',
  bedtimeRepeatMinutes: 30,
  breakEveryMinutes: 90, // 0 disables stretch-break nudges
  waterEveryMinutes: 60, // 0 disables water nudges
  distraction: { // set to false to turn off
    afterMinutes: 30,
    repeatMinutes: 15,
    sites: ['youtube.com', 'instagram.com', 'tiktok.com', 'facebook.com', 'x.com', 'twitter.com',
      'reddit.com', 'netflix.com', 'twitch.tv', 'pinterest.com'],
    apps: [],
  },
  typingCheers: true,
  askShortcut: 'CommandOrControl+Shift+Space', // "" disables the keyboard shortcut
  askModel: '', // e.g. "haiku" for faster answers; empty uses your Claude Code default
  calendars: [], // secret iCal (.ics) addresses, e.g. from Google Calendar
  meetingMinutesBefore: 5, // 0 only tells you when a meeting starts
  idleChatter: true,
  systemNotifications: true, // also show an OS notification for Claude alerts and reminders
  sounds: true,
};

if (process.platform === 'linux') {
  // Transparent windows on Linux are much more reliable without the GPU.
  app.commandLine.appendSwitch('enable-transparent-visuals');
  app.disableHardwareAcceleration();
}

if (!app.requestSingleInstanceLock()) app.quit();

let win;
let config = { ...DEFAULT_CONFIG };
let state = { lastMorning: '', lastLunch: '', lastDinner: '', lastBedtime: 0 };
let reminders = [];

const files = () => {
  const dir = app.getPath('userData');
  return {
    config: path.join(dir, 'config.json'),
    state: path.join(dir, 'state.json'),
    reminders: path.join(dir, 'reminders.json'),
  };
};

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('could not write', file, e.message);
  }
}

function loadConfig() {
  const f = files().config;
  if (!fs.existsSync(f)) writeJson(f, DEFAULT_CONFIG);
  const saved = readJson(f, null);
  config = { ...DEFAULT_CONFIG, ...(saved || {}) };
  // Show settings added in newer versions in the file, so you can find them.
  if (saved && Object.keys(DEFAULT_CONFIG).some((k) => !(k in saved))) {
    writeJson(f, { ...DEFAULT_CONFIG, ...saved });
  }
  // The first version saved its blue as everyone's colour; move them to the new default.
  if (config.color === '#6ec6ff') config.color = DEFAULT_CONFIG.color;
  if (win) win.webContents.send('config', publicConfig());
  registerShortcut();
  const cals = JSON.stringify(config.calendars || []);
  if (cals !== loadedCalendars) {
    loadedCalendars = cals;
    refreshMeetings();
  }
}

function saveConfigKey(key, value) {
  writeJson(files().config, { ...readJson(files().config, {}), [key]: value });
  config[key] = value;
}

function publicConfig() {
  return { color: config.color, sounds: config.sounds, name: config.name };
}

const saveState = () => writeJson(files().state, state);
const saveReminders = () => writeJson(files().reminders, reminders);

// ---------------------------------------------------------------------------
// Movement

let mode = 'bounce';
let pos = { x: 0, y: 0 }; // window top-left, floats
let vel = { x: 0, y: 0 };
let grounded = false;
let nextHopAt = 0;
let drag = null; // { offX, offY, startX, startY, moved, samples: [] }
let alerting = false; // a sticky Claude alert or reminder is on screen
let formOpen = false;
let bubbleRect = null; // {x,y,w,h} in window coords, reported by the renderer
let ignoringMouse = null;
let lastSent = '';

const GRAVITY = 0.55;
const RESTITUTION = 0.72;

function bounds() {
  const d = screen.getDisplayNearestPoint({
    x: Math.round(pos.x + BX), y: Math.round(pos.y + BY),
  });
  const wa = d.workArea;
  return {
    minX: wa.x - (BX - BALL / 2), // lets the ball touch the screen edge
    maxX: wa.x + wa.width - (BX + BALL / 2),
    minY: wa.y,
    floorY: wa.y + wa.height - (BY + BALL / 2),
  };
}

function hop(strength = 1, towardX = null) {
  const b = bounds();
  const cx = pos.x;
  let dir;
  if (towardX !== null) dir = Math.sign(towardX - (cx + BX)) || 1;
  else if (cx < b.minX + 150) dir = 1;
  else if (cx > b.maxX - 150) dir = -1;
  else dir = Math.random() < 0.5 ? -1 : 1;
  vel.y = -(5.5 + Math.random() * 5.5) * strength;
  vel.x = dir * (1.5 + Math.random() * 4) * (towardX !== null ? 0.6 : 1);
  grounded = false;
}

function physicsStep(now) {
  const b = bounds();
  vel.y += GRAVITY;
  vel.x *= 0.995;
  pos.x += vel.x;
  pos.y += vel.y;

  if (pos.y >= b.floorY) {
    pos.y = b.floorY;
    if (vel.y > 2.5) {
      send('squash', Math.min(vel.y / 18, 1));
      vel.y = -vel.y * RESTITUTION;
    } else {
      vel.y = 0;
      if (!grounded) nextHopAt = now + (alerting ? 400 : 1500 + Math.random() * 6000);
      grounded = true;
    }
    vel.x *= 0.85;
  } else {
    grounded = false;
  }
  if (pos.y < b.minY) {
    pos.y = b.minY;
    vel.y = Math.abs(vel.y) * 0.5;
  }
  if (pos.x < b.minX) {
    pos.x = b.minX;
    vel.x = Math.abs(vel.x) * 0.8;
  } else if (pos.x > b.maxX) {
    pos.x = b.maxX;
    vel.x = -Math.abs(vel.x) * 0.8;
  }
}

function followStep(cursor, now, near) {
  // Hover a little below-right of the cursor, like a pet tagging along.
  // Once you reach for it, it holds still so you can click it.
  const b = bounds();
  if (near) {
    vel.x *= 0.7;
    vel.y *= 0.7;
    pos.x += vel.x;
    pos.y += vel.y;
    return;
  }
  const tx = cursor.x + 40 - BX;
  const ty = cursor.y + 36 - BY;
  const dx = tx - pos.x;
  const dy = ty - pos.y;
  const dist = Math.hypot(dx, dy);
  const pull = dist > 40 ? 0.012 : 0.004;
  vel.x = (vel.x + dx * pull) * 0.86;
  vel.y = (vel.y + dy * pull) * 0.86;
  pos.x += vel.x;
  pos.y += vel.y + Math.sin(now / 300) * 0.4; // gentle bob
  pos.x = Math.min(Math.max(pos.x, b.minX), b.maxX);
  pos.y = Math.min(Math.max(pos.y, b.minY), b.floorY);
}

function tick() {
  if (!win || win.isDestroyed()) return;
  const now = Date.now();
  const cursor = screen.getCursorScreenPoint();
  // Is the mouse reaching for the buddy? Then don't run away from it.
  const dist = Math.hypot(cursor.x - (pos.x + BX), cursor.y - (pos.y + BY));
  const near = dist < NEAR;

  if (drag) {
    const nx = cursor.x - drag.offX;
    const ny = cursor.y - drag.offY;
    if (Math.hypot(cursor.x - drag.startX, cursor.y - drag.startY) > 4) drag.moved = true;
    drag.samples.push({ x: nx, y: ny, t: now });
    while (drag.samples.length > 5) drag.samples.shift();
    pos.x = nx;
    pos.y = ny;
    vel.x = 0;
    vel.y = 0;
  } else if (mode === 'follow') {
    followStep(cursor, now, dist < NEAR_FOLLOW);
  } else if (mode === 'bounce') {
    physicsStep(now);
    // Hold still while you reach for it, or while you're typing away.
    if (grounded && (near || typing.typing)) nextHopAt = Math.max(nextHopAt, now + 800);
    if (grounded && now > nextHopAt) {
      hop(alerting ? 1.3 : 0.6 + Math.random() * 0.6, alerting ? cursor.x : null);
    }
  }
  // "still" and "sleep" stay exactly where you put them.

  const rx = Math.round(pos.x);
  const ry = Math.round(pos.y);
  const [wx, wy] = win.getPosition();
  if (rx !== wx || ry !== wy) win.setPosition(rx, ry);

  // Eyes follow the cursor; body stretches with vertical speed.
  const look = {
    dx: Math.round(cursor.x - (rx + BX)),
    dy: Math.round(cursor.y - (ry + BY)),
    vy: mode === 'bounce' && !grounded && !drag ? Math.round(vel.y * 10) / 10 : 0,
  };
  const key = `${look.dx},${look.dy},${look.vy}`;
  if (key !== lastSent) {
    lastSent = key;
    send('look', look);
  }

  // Only catch the mouse when it's over the ball or the bubble, so the rest
  // of the transparent window never gets in your way.
  const lx = cursor.x - rx;
  const ly = cursor.y - ry;
  const overBall = Math.hypot(lx - BX, ly - BY) <= BALL / 2 + 8;
  const overBubble = bubbleRect
    && lx >= bubbleRect.x && lx <= bubbleRect.x + bubbleRect.w
    && ly >= bubbleRect.y && ly <= bubbleRect.y + bubbleRect.h;
  const ignore = !(overBall || overBubble || formOpen || drag);
  if (ignore !== ignoringMouse) {
    ignoringMouse = ignore;
    win.setIgnoreMouseEvents(ignore);
  }
}

function setMode(m) {
  mode = m;
  vel = { x: 0, y: 0 };
  send('mode', mode);
  if (m === 'bounce') nextHopAt = Date.now() + 500;
  refreshTray();
}

// ---------------------------------------------------------------------------
// Talking

function send(channel, data) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
}

function name() {
  return config.name ? `, ${config.name}` : '';
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// mood: happy | excited | alert | sleepy | hungry | love | sad | surprised | sly | thinking
function say(text, {
  mood = 'happy', duration = 6000, sticky = false, key = null, sound = null, notify = false, urgent = false, link = '',
} = {}) {
  send('say', { text, mood, duration, sticky, key, sound, urgent, link });
  if (notify && config.systemNotifications && Notification.isSupported()) {
    new Notification({ title: 'Buddy', body: text, silent: true }).show();
  }
}

// ---------------------------------------------------------------------------
// Daily rhythm: good morning, lunch, dinner, bedtime, stretch breaks, chatter

let activeSince = Date.now();
let lastWaterAt = Date.now();
let nextChatterAt = Date.now() + 20 * 60000;

function today() {
  return new Date().toDateString();
}

function inWindow(nowMin, from, to) {
  const a = toMinutes(from);
  const b = toMinutes(to);
  return a <= b ? nowMin >= a && nowMin < b : nowMin >= a || nowMin < b;
}

function isNight() {
  if (!config.bedtime) return false;
  const d = new Date();
  return inWindow(d.getHours() * 60 + d.getMinutes(), config.bedtime, config.bedtimeUntil || '04:00');
}

function scheduleCheck() {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  let idleSec = 0;
  try {
    idleSec = powerMonitor.getSystemIdleTime();
  } catch {
    /* not available on some Linux setups */
  }
  const present = idleSec < 90;

  send('night', isNight());

  // Reminders fire even if you're away; they stay until clicked.
  const due = reminders.filter((r) => r.at <= now.getTime());
  if (due.length) {
    reminders = reminders.filter((r) => r.at > now.getTime());
    saveReminders();
    refreshTray();
    for (const r of due) {
      say(`⏰ Reminder: ${r.text}`, { mood: 'alert', sticky: true, sound: 'alert', key: `rem:${r.id}`, notify: true });
    }
  }

  if (!present) {
    if (idleSec > 5 * 60) activeSince = Date.now();
    // A longer break away probably included a drink.
    if (idleSec > 20 * 60) lastWaterAt = Date.now();
    return;
  }

  const m = config.morning;
  if (m && state.lastMorning !== today() && inWindow(nowMin, m.from, m.to)) {
    state.lastMorning = today();
    saveState();
    if (mode === 'sleep') setMode(config.startMode === 'sleep' ? 'bounce' : config.startMode);
    say(pick([
      `Good morning${name()}! ☀️`,
      `Morning${name()}! Ready for today?`,
      `Hiii${name()}! Good morning 🌼`,
      `Rise and shine${name()}! ✨`,
    ]), { mood: 'excited', duration: 9000, sound: 'happy' });
    return;
  }

  if (config.lunch && state.lastLunch !== today()
      && nowMin >= toMinutes(config.lunch) && nowMin < toMinutes(config.lunch) + 120) {
    state.lastLunch = today();
    saveState();
    say(pick([
      `Lunch time${name()}! 🍜 Go eat something.`,
      `It's ${config.lunch}, my tummy says lunch 🥪`,
      `Food break! Step away from the screen 🍝`,
    ]), { mood: 'hungry', sticky: true, sound: 'happy', key: 'meal' });
    return;
  }

  if (config.dinner && state.lastDinner !== today()
      && nowMin >= toMinutes(config.dinner) && nowMin < toMinutes(config.dinner) + 120) {
    state.lastDinner = today();
    saveState();
    say(`Dinner time${name()}! 🍲`, { mood: 'hungry', sticky: true, sound: 'happy', key: 'meal' });
    return;
  }

  if (isNight() && Date.now() - state.lastBedtime > (config.bedtimeRepeatMinutes || 30) * 60000) {
    state.lastBedtime = Date.now();
    saveState();
    const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    say(pick([
      `It's ${hm}… getting late${name()} 🌙`,
      `${hm} already! Time to wrap up? 😴`,
      `Bed soon? It's ${hm} 🌙 Tomorrow-you will say thanks.`,
    ]), { mood: 'sleepy', duration: 15000, key: 'night' });
    return;
  }

  if (config.waterEveryMinutes > 0 && Date.now() - lastWaterAt > config.waterEveryMinutes * 60000) {
    lastWaterAt = Date.now();
    say(pick([
      'Sip some water 💧',
      'Water break! 💧 Your brain is mostly water, you know.',
      'Psst… hydrate 💧',
      'Have a glass of water? 💧 I\'ll wait.',
    ]), { mood: 'love', duration: 12000, key: 'water' });
    return;
  }

  if (config.breakEveryMinutes > 0 && Date.now() - activeSince > config.breakEveryMinutes * 60000) {
    activeSince = Date.now();
    say(pick([
      'You\'ve been at it a while. Stretch break? 🧘',
      'Blink, breathe, drink some water 💧',
      'Stand up and wiggle for a minute! 🕺',
    ]), { mood: 'love', duration: 12000, key: 'break' });
    return;
  }

  if (config.idleChatter && Date.now() > nextChatterAt && mode !== 'sleep') {
    nextChatterAt = Date.now() + (25 + Math.random() * 30) * 60000;
    say(pick([
      'hi :)', 'You\'re doing great 💛', 'boing!', 'Have you had water lately? 💧',
      '*happy bounce*', 'I believe in you ✨', 'Just checking in. All good?',
    ]), { mood: pick(['happy', 'love', 'excited']), duration: 5000 });
  }
}

// ---------------------------------------------------------------------------
// Distractions: a gentle "hey 👀" after a long stretch on YouTube & co.

let focus = null;
let focusKey = '';

function idleSeconds() {
  try {
    return powerMonitor.getSystemIdleTime();
  } catch {
    return 0;
  }
}

async function checkDistraction() {
  const d = config.distraction;
  if (!d) return;
  const key = `${d.afterMinutes}/${d.repeatMinutes}`;
  if (!focus || key !== focusKey) {
    focus = new FocusTracker(d);
    focusKey = key;
  }
  // Away from the computer counts as not distracted.
  const label = idleSeconds() < 10 * 60 ? matchDistraction(await currentActivity(), d) : null;
  const nudge = focus.sample(Date.now(), label);
  if (!nudge) return;
  const m = nudge.minutes;
  say(pick([
    `${m} minutes of ${nudge.label}… 👀`,
    `Hey${name()}, you've been on ${nudge.label} for ${m} min 👀`,
    `Psst. ${nudge.label}, ${m} min. Back to it? 👀`,
    `Is this still the plan? ${m} min on ${nudge.label} 👀`,
  ]), { mood: 'sly', duration: 12000, key: 'focus', sound: 'poke' });
}

// ---------------------------------------------------------------------------
// Typing: the flame flickers while you type and cheers on long streaks.

const typing = new TypingTracker();
let lastCursor = null;
let idleWorks = false; // some systems always report 0; don't take that as typing

function checkTyping() {
  const c = screen.getCursorScreenPoint();
  const moved = !lastCursor || c.x !== lastCursor.x || c.y !== lastCursor.y;
  lastCursor = c;
  const idle = idleSeconds();
  if (idle > 0) idleWorks = true;
  const r = typing.sample(Date.now(), idleWorks && idle === 0, moved || !!drag);
  if (r.changed) send('typing', r.typing);
  if (r.milestone && config.typingCheers) {
    const lines = {
      10: ['You\'re on fire! 🔥', 'Look at you go! ⌨️✨', 'Tap tap tap! 🔥'],
      25: ['25 minutes of typing! Unstoppable 🔥', 'Wow, you\'re in the zone ✨'],
      45: ['45 minutes of typing! 🔥 Shake out your hands?', 'Such focus! Roll your shoulders a bit 🙆'],
      90: ['90 minutes of typing!! Legend. Take a real break? 🌿'],
    }[r.milestone] || ['🔥'];
    say(pick(lines), { mood: 'excited', duration: 6000, sound: 'happy' });
  }
}

// ---------------------------------------------------------------------------
// Ask me anything (answers come from Claude Code)

let lastAskAt = 0;
let asking = false;

function openForm(kind) {
  formOpen = true;
  if (process.platform === 'darwin') app.focus({ steal: true });
  win.focus();
  send('open-form', kind);
}

async function ask(question) {
  const q = String(question || '').trim().slice(0, 2000);
  if (!q) return;
  if (asking) {
    say('One question at a time, I\'m still thinking 🤔', { mood: 'thinking', duration: 3000 });
    return;
  }
  asking = true;
  say(pick(['Hmm, let me think… 🤔', 'Thinking… 🤔', 'Ooh, good one. One sec… 🤔']),
    { mood: 'thinking', duration: 150000, key: 'ask', urgent: true });
  const followUp = Date.now() - lastAskAt < 10 * 60000;
  const res = await askClaude(q, {
    cwd: path.join(app.getPath('userData'), 'ask'),
    followUp,
    model: config.askModel,
  });
  asking = false;
  lastAskAt = Date.now();
  if (res.ok) {
    say(res.text, { mood: 'happy', sticky: true, sound: 'happy', key: 'ask', urgent: true });
  } else if (res.missing) {
    say('I can\'t find Claude Code on this computer 😢 In Terminal, check that "claude --version" works. If it doesn\'t, install it with: curl -fsSL https://claude.ai/install.sh | bash',
      { mood: 'sad', sticky: true, key: 'ask', urgent: true });
  } else {
    say(`Hmm, that didn't work: ${res.text.slice(0, 200)}`, { mood: 'sad', sticky: true, key: 'ask', urgent: true });
  }
}

let shortcut = '';
function registerShortcut() {
  if (!app.isReady() || config.askShortcut === shortcut) return;
  if (shortcut) globalShortcut.unregister(shortcut);
  shortcut = '';
  if (!config.askShortcut) return;
  try {
    if (globalShortcut.register(config.askShortcut, () => win && openForm('ask'))) shortcut = config.askShortcut;
    else console.error('shortcut taken:', config.askShortcut);
  } catch (e) {
    console.error('bad shortcut:', config.askShortcut, e.message);
  }
}

// ---------------------------------------------------------------------------
// Meetings from your calendar(s)

let loadedCalendars = '';
let meetings = [];
let calendarError = '';
const announced = new Map(); // "<meeting id>:soon|now" -> when we said it

async function refreshMeetings() {
  const urls = (config.calendars || []).filter(Boolean);
  if (!urls.length) {
    meetings = [];
    refreshTray();
    return;
  }
  const from = new Date(Date.now() - 60 * 60000);
  const to = new Date(Date.now() + 36 * 3600000);
  const all = [];
  const errors = [];
  await Promise.all(urls.map(async (u) => {
    try {
      all.push(...await fetchMeetings(u, from, to));
    } catch (e) {
      errors.push(e.message);
    }
  }));
  // If every calendar failed (offline?), keep what we had.
  if (all.length || !errors.length) meetings = all.sort((a, b) => a.start - b.start);
  calendarError = errors[0] || '';
  refreshTray();
}

function hhmm(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function checkMeetings() {
  const now = Date.now();
  const lead = Math.max(0, Number(config.meetingMinutesBefore) || 0) * 60000;
  for (const m of meetings) {
    const key = `meet:${m.id}`;
    if (lead && now >= m.start - lead && now < m.start - 30000 && !announced.has(`${m.id}:soon`)) {
      announced.set(`${m.id}:soon`, now);
      const mins = Math.max(1, Math.round((m.start - now) / 60000));
      say(`📅 ${m.title} in ${mins} min${mins === 1 ? '' : 's'} (${hhmm(m.start)})`,
        { mood: 'alert', sticky: true, sound: 'alert', key, notify: true, link: m.link });
    } else if (now >= m.start - 30000 && now < m.start + 5 * 60000 && !announced.has(`${m.id}:now`)) {
      announced.set(`${m.id}:now`, now);
      announced.set(`${m.id}:soon`, now);
      say(`📅 ${m.title} is starting now!`,
        { mood: 'alert', sticky: true, sound: 'alert', key, notify: true, link: m.link });
    }
  }
  for (const [k, t] of announced) if (now - t > 24 * 3600000) announced.delete(k);
}

function meetingMenu() {
  const items = [];
  if (!(config.calendars || []).length) {
    items.push({ label: 'Connect Google Calendar…', click: () => openForm('calendar') });
    return items;
  }
  const upcoming = meetings.filter((m) => m.end > Date.now()).slice(0, 10);
  if (!upcoming.length) items.push({ label: calendarError ? `Couldn't load: ${calendarError}`.slice(0, 70) : 'Nothing coming up 🎉', enabled: false });
  for (const m of upcoming) {
    const day = new Date(m.start).toDateString() === new Date().toDateString() ? '' : 'tomorrow ';
    items.push({
      label: `${day}${hhmm(m.start)}  ${m.title}${m.link ? '  📹' : ''}`.slice(0, 70),
      enabled: !!m.link,
      click: () => openLink(m.link),
    });
  }
  items.push(
    { type: 'separator' },
    { label: 'Refresh', click: () => refreshMeetings() },
    { label: 'Connect another calendar…', click: () => openForm('calendar') },
    {
      label: 'Disconnect calendars',
      click: () => {
        saveConfigKey('calendars', []);
        meetings = [];
        refreshTray();
        say('Okay, calendars disconnected 👋', { duration: 4000 });
      },
    },
  );
  return items;
}

function openLink(url) {
  // Only real web links, never file:// or anything else.
  if (/^https:\/\//i.test(url || '')) shell.openExternal(url);
}

async function addCalendar(url) {
  const u = String(url || '').trim();
  if (!/^(https?|webcal):\/\//i.test(u)) return { ok: false, error: 'That should start with https://' };
  let found;
  try {
    found = await fetchMeetings(u, new Date(), new Date(Date.now() + 36 * 3600000));
  } catch (e) {
    return { ok: false, error: `Hmm, ${e.message}` };
  }
  const list = (config.calendars || []).filter((x) => x !== u).concat(u);
  saveConfigKey('calendars', list);
  loadedCalendars = JSON.stringify(list);
  formOpen = false;
  await refreshMeetings();
  const next = found[0];
  say(next ? `Calendar connected! Next up: ${next.title} at ${hhmm(next.start)} 📅` : 'Calendar connected! Nothing on it in the next day 🎉',
    { mood: 'excited', duration: 7000, sound: 'happy' });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Reminders

function addReminder(text, when) {
  const at = parseWhen(when);
  if (!at || !text) return null;
  const r = { id: `${Date.now()}${Math.floor(Math.random() * 1000)}`, text: String(text).slice(0, 200), at };
  reminders.push(r);
  reminders.sort((a, b) => a.at - b.at);
  saveReminders();
  refreshTray();
  return r;
}

// ---------------------------------------------------------------------------
// Claude Code hooks + small local API (127.0.0.1 only)

function handleClaudeHook(p) {
  const project = p.cwd ? path.basename(p.cwd) : '';
  const where = project ? ` (${project})` : '';
  const key = `claude:${p.session_id || 'default'}`;
  switch (p.hook_event_name) {
    case 'Notification': {
      const msg = p.message || 'Claude needs you';
      say(`🙋 ${msg}${where}`, { mood: 'alert', sticky: true, sound: 'alert', key, notify: true });
      break;
    }
    case 'Stop':
      say(pick([`Claude is done${where}! Your turn ✨`, `Claude finished${where} 🎉`]),
        { mood: 'excited', duration: 10000, sound: 'happy', key });
      break;
    case 'UserPromptSubmit':
      // You answered Claude, so any alert for that session can go away.
      send('dismiss', key);
      break;
    default:
      break;
  }
}

function startServer() {
  const server = http.createServer((req, res) => {
    const reply = (code, obj) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(obj));
    };
    // Browsers always send Origin on cross-site POSTs; scripts and curl don't.
    // This stops random web pages from making the buddy talk.
    if (req.headers.origin) return reply(403, { error: 'forbidden' });
    if (req.method === 'GET' && req.url === '/health') return reply(200, { ok: true, mode });
    if (req.method !== 'POST') return reply(404, { error: 'not found' });

    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 64 * 1024) req.destroy();
    });
    req.on('end', () => {
      let data = {};
      try {
        data = body ? JSON.parse(body) : {};
      } catch {
        data = { text: body };
      }
      switch (req.url) {
        case '/claude':
          handleClaudeHook(data);
          return reply(200, { ok: true });
        case '/say':
          say(String(data.text || '…').slice(0, 300), {
            mood: data.mood || 'happy',
            duration: data.duration || 6000,
            sticky: !!data.sticky,
            sound: data.sound || null,
          });
          return reply(200, { ok: true });
        case '/remind': {
          const r = addReminder(data.text, data.when);
          if (!r) return reply(400, { error: 'need text and when, e.g. {"text":"tea","when":"10m"}' });
          say(`Okay! I'll remind you at ${formatWhen(r.at)} 👍`, { mood: 'happy', duration: 4000 });
          return reply(200, { ok: true, at: new Date(r.at).toISOString() });
        }
        case '/mode':
          if (['bounce', 'follow', 'still', 'sleep'].includes(data.mode)) {
            setMode(data.mode);
            return reply(200, { ok: true });
          }
          return reply(400, { error: 'mode must be bounce|follow|still|sleep' });
        default:
          return reply(404, { error: 'not found' });
      }
    });
    return undefined;
  });
  server.on('error', (e) => {
    console.error('buddy server:', e.message);
    if (e.code === 'EADDRINUSE') {
      say(`Port ${config.port} is busy, so Claude can't reach me 😢`, { mood: 'sad', duration: 10000 });
    }
  });
  server.listen(config.port, '127.0.0.1');
}

// ---------------------------------------------------------------------------
// Menu

function menuTemplate() {
  const reminderItems = reminders.length
    ? reminders.map((r) => ({
      label: `${formatWhen(r.at)} – ${r.text}`.slice(0, 60),
      submenu: [{
        label: 'Cancel this reminder',
        click: () => {
          reminders = reminders.filter((x) => x.id !== r.id);
          saveReminders();
          refreshTray();
        },
      }],
    }))
    : [{ label: 'No reminders yet', enabled: false }];

  const modeItem = (m, label) => ({
    label, type: 'radio', checked: mode === m, click: () => setMode(m),
  });

  const items = [
    modeItem('bounce', 'Bounce around'),
    modeItem('follow', 'Follow me'),
    modeItem('still', 'Sit still'),
    modeItem('sleep', 'Sleep'),
    { type: 'separator' },
    {
      label: 'Ask me anything…',
      accelerator: config.askShortcut || undefined,
      registerAccelerator: false,
      click: () => openForm('ask'),
    },
    { label: 'Add reminder…', click: () => openForm('remind') },
    { label: 'Reminders', submenu: reminderItems },
    { label: 'Meetings', submenu: meetingMenu() },
    { type: 'separator' },
    {
      label: 'Sounds', type: 'checkbox', checked: config.sounds,
      click: (i) => {
        config.sounds = i.checked;
        writeJson(files().config, { ...readJson(files().config, {}), sounds: i.checked });
        send('config', publicConfig());
      },
    },
  ];
  if (process.platform !== 'linux') {
    items.push({
      label: 'Start when I log in', type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (i) => app.setLoginItemSettings({ openAtLogin: i.checked }),
    });
  }
  items.push(
    { label: 'Open settings file', click: () => shell.openPath(files().config) },
    { label: 'Test a Claude alert', click: () => handleClaudeHook({ hook_event_name: 'Notification', message: 'Claude needs your permission to use Bash', cwd: '/demo/project', session_id: 'test' }) },
    { type: 'separator' },
    { label: 'Bye for now (quit)', click: () => app.quit() },
  );
  return items;
}

function showMenu() {
  Menu.buildFromTemplate(menuTemplate()).popup({ window: win });
}

// A menu bar / tray icon with the same menu, so you can always reach it,
// even when the buddy is busy hopping around.
let tray = null;

function createTray() {
  const mac = process.platform === 'darwin';
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', mac ? 'trayTemplate.png' : 'tray.png'));
  if (mac) icon.setTemplateImage(true);
  try {
    tray = new Tray(icon);
  } catch (e) {
    console.error('no tray:', e.message);
    return;
  }
  tray.setToolTip('Buddy');
  if (process.platform === 'linux') {
    refreshTray();
  } else {
    const open = () => tray.popUpContextMenu(Menu.buildFromTemplate(menuTemplate()));
    tray.on('click', open);
    tray.on('right-click', open);
  }
}

// Linux trays can't build the menu on click, so keep it up to date instead.
function refreshTray() {
  if (tray && process.platform === 'linux') tray.setContextMenu(Menu.buildFromTemplate(menuTemplate()));
}

// ---------------------------------------------------------------------------
// IPC from the renderer

ipcMain.on('drag-start', (_e, { x, y }) => {
  const c = screen.getCursorScreenPoint();
  drag = { offX: x, offY: y, startX: c.x, startY: c.y, moved: false, samples: [] };
});

ipcMain.on('drag-end', () => {
  if (!drag) return;
  const d = drag;
  drag = null;
  if (!d.moved) {
    send('poked');
    if (mode === 'bounce' && grounded) hop(0.8);
    return;
  }
  // Throw with the speed you let go at.
  const s = d.samples;
  if (s.length >= 2) {
    const a = s[0];
    const b = s[s.length - 1];
    const dt = Math.max(b.t - a.t, 1) / 16;
    vel.x = Math.max(-40, Math.min(40, (b.x - a.x) / dt));
    vel.y = Math.max(-40, Math.min(40, (b.y - a.y) / dt));
  }
  grounded = false;
  if (mode !== 'bounce') vel = { x: 0, y: 0 };
});

ipcMain.on('menu', () => showMenu());
ipcMain.on('bubble-rect', (_e, r) => {
  bubbleRect = r;
});
ipcMain.on('alerting', (_e, on) => {
  alerting = !!on;
  if (alerting) nextHopAt = 0;
});
ipcMain.on('form-closed', () => {
  formOpen = false;
});
ipcMain.on('open-ask', () => openForm('ask'));
ipcMain.on('open-link', (_e, url) => openLink(url));
ipcMain.handle('add-calendar', (_e, url) => addCalendar(url));
ipcMain.on('ask', (_e, q) => {
  formOpen = false;
  ask(q);
});
ipcMain.handle('add-reminder', (_e, { text, when }) => {
  const r = addReminder(text, when);
  if (!r) return { ok: false };
  formOpen = false;
  say(`Got it! ${formatWhen(r.at)} – "${r.text}" 👍`, { mood: 'happy', duration: 4000 });
  return { ok: true };
});

// ---------------------------------------------------------------------------

function createWindow() {
  const wa = screen.getPrimaryDisplay().workArea;
  pos = { x: wa.x + wa.width - W - 80, y: wa.y + wa.height - H };

  win = new BrowserWindow({
    width: W,
    height: H,
    x: Math.round(pos.x),
    y: Math.round(pos.y),
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    resizable: false,
    movable: false,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      autoplayPolicy: 'no-user-gesture-required',
      backgroundThrottling: false,
    },
  });
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(__dirname, 'index.html'));

  win.webContents.on('did-finish-load', () => {
    send('config', publicConfig());
    setMode(config.startMode);
    send('night', isNight());
    say(pick([`Hi${name()}! I'm here 👋`, 'Boing! Hello!', 'Ready when you are ✨']), { mood: 'excited', duration: 4000 });
    setTimeout(scheduleCheck, 3000);
  });

  setInterval(tick, 16);
  setInterval(scheduleCheck, 20000);
  setInterval(checkTyping, 500);
  setInterval(checkDistraction, 15000);
  setInterval(checkMeetings, 15000);
  setInterval(refreshMeetings, 10 * 60000);
}

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) app.dock.hide();
  loadConfig();
  state = { ...state, ...readJson(files().state, {}) };
  reminders = readJson(files().reminders, []);
  try {
    fs.watch(files().config, { persistent: false }, () => setTimeout(loadConfig, 100));
  } catch {
    /* watching is a nicety */
  }
  createWindow();
  createTray();
  startServer();
  registerShortcut();

  powerMonitor.on('resume', () => {
    setTimeout(scheduleCheck, 2000);
    setTimeout(refreshMeetings, 5000); // the network needs a moment after waking up
  });
  powerMonitor.on('unlock-screen', () => setTimeout(scheduleCheck, 2000));
});

app.on('will-quit', () => globalShortcut.unregisterAll());

app.on('second-instance', () => say('I\'m already here! 👀', { mood: 'surprised', duration: 3000 }));
app.on('window-all-closed', () => app.quit());
