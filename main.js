const {
  app, BrowserWindow, screen, ipcMain, Menu, Notification, powerMonitor, shell,
} = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { parseWhen, formatWhen, toMinutes } = require('./when');

// ---------------------------------------------------------------------------
// Geometry: the window is a small transparent box. The ball sits at the bottom
// centre, the speech bubble floats above it.
const W = 220;
const H = 170;
const BALL = 48;
const BX = W / 2; // ball centre inside the window
const BY = H - BALL / 2 - 2;

const DEFAULT_CONFIG = {
  name: '', // what the buddy calls you, e.g. "Christine"
  port: 47321, // local HTTP port for Claude Code hooks and scripts
  color: '#6ec6ff',
  startMode: 'bounce', // bounce | follow | still | sleep
  morning: { from: '05:00', to: '11:30' },
  lunch: '12:30',
  dinner: '19:00', // set to "" to disable
  bedtime: '23:00',
  bedtimeUntil: '04:00',
  bedtimeRepeatMinutes: 30,
  breakEveryMinutes: 90, // 0 disables stretch-break nudges
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
  config = { ...DEFAULT_CONFIG, ...readJson(f, {}) };
  if (win) win.webContents.send('config', publicConfig());
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

function followStep(cursor, now) {
  // Hover a little below-right of the cursor, like a pet tagging along.
  const b = bounds();
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
    followStep(cursor, now);
  } else if (mode === 'bounce') {
    physicsStep(now);
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
  const overBall = Math.hypot(lx - BX, ly - BY) <= BALL / 2 + 4;
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

// mood: happy | excited | alert | sleepy | hungry | love | sad | surprised
function say(text, { mood = 'happy', duration = 6000, sticky = false, key = null, sound = null, notify = false } = {}) {
  send('say', { text, mood, duration, sticky, key, sound });
  if (notify && config.systemNotifications && Notification.isSupported()) {
    new Notification({ title: 'Buddy', body: text, silent: true }).show();
  }
}

// ---------------------------------------------------------------------------
// Daily rhythm: good morning, lunch, dinner, bedtime, stretch breaks, chatter

let activeSince = Date.now();
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
    for (const r of due) {
      say(`⏰ Reminder: ${r.text}`, { mood: 'alert', sticky: true, sound: 'alert', key: `rem:${r.id}`, notify: true });
    }
  }

  if (!present) {
    if (idleSec > 5 * 60) activeSince = Date.now();
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
// Reminders

function addReminder(text, when) {
  const at = parseWhen(when);
  if (!at || !text) return null;
  const r = { id: `${Date.now()}${Math.floor(Math.random() * 1000)}`, text: String(text).slice(0, 200), at };
  reminders.push(r);
  reminders.sort((a, b) => a.at - b.at);
  saveReminders();
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

function showMenu() {
  const reminderItems = reminders.length
    ? reminders.map((r) => ({
      label: `${formatWhen(r.at)} – ${r.text}`.slice(0, 60),
      submenu: [{
        label: 'Cancel this reminder',
        click: () => {
          reminders = reminders.filter((x) => x.id !== r.id);
          saveReminders();
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
      label: 'Add reminder…',
      click: () => {
        formOpen = true;
        win.focus();
        send('open-reminder-form');
      },
    },
    { label: 'Reminders', submenu: reminderItems },
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
  Menu.buildFromTemplate(items).popup({ window: win });
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
  startServer();

  powerMonitor.on('resume', () => setTimeout(scheduleCheck, 2000));
  powerMonitor.on('unlock-screen', () => setTimeout(scheduleCheck, 2000));
});

app.on('second-instance', () => say('I\'m already here! 👀', { mood: 'surprised', duration: 3000 }));
app.on('window-all-closed', () => app.quit());
