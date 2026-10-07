# Buddy

A little bouncing flame with eyes that lives on your desktop. It:

- **tells you when Claude Code needs you** (a permission prompt, or Claude waiting for input) and when Claude is done
- **says good morning** the first time you're at your computer each day
- **reminds you to eat** at lunch and dinner time
- **tells you when it's late** and keeps nudging every 30 minutes until you go to bed
- **suggests a stretch break** when you've been at it for a long time, and **reminds you to drink water** every hour
- **remembers reminders** you give it ("tea in 10m", "call mom at 18:30")
- **reminds you of meetings** from your Google Calendar 5 minutes before, with a **Join call** button
- **answers questions**: double-click it (or press ⌘⇧Space / Ctrl+Shift+Space) and ask anything. Answers come from Claude Code.
- **notices distractions**: after 30 minutes on YouTube, Instagram, TikTok & co. it gives you a gentle "hey 👀"
- **cheers you on while you type**: the flame flickers along, and long typing streaks get a "You're on fire! 🔥"
- bounces around, **follows your mouse** if you ask, and its eyes always watch your cursor

![Buddy's moods](docs/moods.png)

## Run it

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
git clone https://github.com/Axofox/buddy
cd buddy
npm install
npm start
```

The flame appears near the bottom-right of your screen and says hi. A little flame icon also appears in your menu bar (or system tray) with the same menu as right-clicking it, including **Hide buddy / Show buddy**. Hidden, the buddy still comes back by itself when something important happens (Claude needs you, a reminder or a meeting).

### Make it a real app (no Terminal needed)

```bash
npm run app
```

On a Mac this builds **Buddy.app** and puts it in your Applications folder (the first time downloads ~100 MB and takes a minute). Open it from Launchpad or Spotlight (⌘ Space → "Buddy"), then right-click the flame → **Start when I log in**, so the flame is always in your menu bar. After a `git pull`, run `npm run app` again to update the app.

## Playing with it

| Do this | What happens |
|---|---|
| **Click** it | It giggles. Poke it a lot and it gets grumpy. |
| **Double-click** it | Opens *Ask me anything*. |
| **Drag and throw** it | It flies and bounces off the screen edges. |
| **Right-click** it, or click the **menu bar icon** | Menu: *Bounce around*, *Follow me*, *Sit still*, *Sleep*, *Ask me anything…*, *Add reminder…*, your reminders, your meetings, sounds, start at login, settings, quit |
| **Click a bubble** with an orange border | Dismisses it. Important messages stay until you click them. |

When something important comes in (Claude needs you, or a reminder is due), it turns golden, shows a **!**, jiggles, plays a little sound, and in *Bounce* mode hops toward your mouse until you click it. Whenever your mouse gets close, it holds still so you can catch it.

### Reminders

Right-click → **Add reminder…**, type what and when, then press Enter. Esc cancels.

You can write the time as `10m`, `45 min`, `1h30`, `in 2 hours`, `14:30`, `2pm` or `tomorrow 9am`. A bare number means minutes.

Reminders are saved, so they survive a restart. To cancel one, right-click → **Reminders**.

### Meetings from Google Calendar

Buddy reads your calendar through its private iCal link. You don't need a Google login or any setup on Google's side.

1. Open [Google Calendar](https://calendar.google.com) in your browser.
2. In the list on the left, hover over your calendar → **⋮** → **Settings and sharing**.
3. Scroll down to **Integrate calendar** and copy the **Secret address in iCal format** (it ends in `basic.ics`).
4. Right-click Buddy → **Meetings** → **Connect Google Calendar…**, paste it, and press Enter.

Five minutes before each meeting, Buddy turns golden and says *"📅 Standup in 5 mins (10:00)"*. If the meeting has a Google Meet, Zoom, Teams, Webex or Whereby link, it also shows a **Join call** button. When the meeting starts, it reminds you again. Right-click → **Meetings** lists what's coming up (click one to join), and lets you connect more calendars or disconnect them.

Buddy checks your calendar every 10 minutes. All-day events and cancelled meetings are skipped. Keep the secret address private: anyone who has it can see your calendar. Buddy stores it only in your settings file. Other calendars that offer an `.ics` link (Outlook, iCloud, Fastmail…) work too. Change the warning time with `meetingMinutesBefore`.

### Ask me anything

Double-click the flame, press **⌘⇧Space** (Mac) or **Ctrl+Shift+Space** (Windows/Linux), or right-click → **Ask me anything…**. Type your question and press Enter.

Buddy passes the question to [Claude Code](https://claude.com/claude-code) (`claude -p`), so you need the Claude Code command line installed and logged in. Nothing else to set up. If Buddy says it can't find Claude Code, open Terminal and run `claude --version`. If that says "command not found", install it with `curl -fsSL https://claude.ai/install.sh | bash`, run `claude` once to log in, then ask Buddy again. Answers are short, and Claude can search the web when it needs to. If you ask again within 10 minutes, Claude remembers the earlier question, so follow-ups like "and in French?" work. Click the answer to close it.

### Distraction nudges

Every 15 seconds Buddy checks which app is in front and, for browsers, which website. After 30 minutes on a distracting site (a short hop to another tab doesn't reset the count), it says something like *"Hey, you've been on YouTube for 30 min 👀"*, then again every 15 minutes. It only counts while you're at the computer, and nothing is stored or sent anywhere.

- **macOS:** works with Safari, Chrome, Arc, Brave, Edge and Vivaldi. The first time, macOS asks whether Buddy (shown as "Electron") may control your browser. Say OK; without it, Buddy can only see app names. You can change this later in System Settings → Privacy & Security → Automation. Firefox doesn't let other apps read its address bar, so it isn't supported.
- **Linux:** install `xdotool`; Buddy then matches window titles.
- **Windows:** not supported yet.

Change the sites, add apps (for example `"Steam"`), or adjust the timing in the settings file (`distraction`). Set `"distraction": false` to turn it off.

### Typing

While you type, the flame flickers along and stops hopping around, so it doesn't distract you. After 10, 25, 45 and 90 minutes of typing, it cheers you on. Buddy never reads your keys: it only notices that there's input while the mouse stays still. Scrolling with a trackpad can look like typing too. Turn the cheers off with `"typingCheers": false`.

## Connect it to Claude Code

Claude Code can run a command on certain events (a feature called *hooks*). Buddy comes with `notify.js`, which forwards those events to Buddy. It finishes instantly and never blocks Claude, even when Buddy isn't running.

Add this to `~/.claude/settings.json` and replace `/path/to/buddy` with the folder where you cloned this repo. On Windows, use forward slashes, for example `C:/Users/you/buddy/notify.js`.

```json
{
  "hooks": {
    "Notification": [
      { "hooks": [{ "type": "command", "command": "node /path/to/buddy/notify.js" }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "command", "command": "node /path/to/buddy/notify.js" }] }
    ],
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "node /path/to/buddy/notify.js" }] }
    ]
  }
}
```

If that file already has a `"hooks"` section, merge these three entries into it.

| Claude Code event | Buddy |
|---|---|
| `Notification` (needs permission, or waiting for you) | 🙋 golden alert that stays until you click it, plus an OS notification. The project folder name is shown. |
| `Stop` (Claude finished its turn) | "Claude is done! Your turn ✨" |
| `UserPromptSubmit` (you replied to Claude) | Clears that session's alert automatically |

To try it without Claude, right-click → **Test a Claude alert**.

## Talk to it from anywhere

Buddy listens on `http://127.0.0.1:47321`. Only your own computer can reach it.

```bash
# say something (moods: happy excited alert surprised sleepy hungry love sad)
curl -X POST 127.0.0.1:47321/say -d '{"text":"Build finished!","mood":"excited"}'

# a message that stays until clicked
curl -X POST 127.0.0.1:47321/say -d '{"text":"Deploy failed","mood":"sad","sticky":true,"sound":"alert"}'

# set a reminder
curl -X POST 127.0.0.1:47321/remind -d '{"text":"stand-up meeting","when":"9:55"}'

# change mode: bounce | follow | still | sleep
curl -X POST 127.0.0.1:47321/mode -d '{"mode":"follow"}'
```

Because of this, you can ask Claude Code something like *"remind me through buddy in 20 minutes to check the deploy"*, and it can do that with `curl`.

## Settings

Right-click → **Open settings file**. Changes apply as soon as you save. The defaults are:

```json
{
  "name": "",
  "port": 47321,
  "color": "#ee5a3a",
  "startMode": "bounce",
  "morning": { "from": "05:00", "to": "11:30" },
  "lunch": "12:30",
  "dinner": "19:00",
  "bedtime": "23:00",
  "bedtimeUntil": "04:00",
  "bedtimeRepeatMinutes": 30,
  "breakEveryMinutes": 90,
  "waterEveryMinutes": 60,
  "distraction": {
    "afterMinutes": 30,
    "repeatMinutes": 15,
    "sites": ["youtube.com", "instagram.com", "tiktok.com", "facebook.com", "x.com", "twitter.com",
      "reddit.com", "netflix.com", "twitch.tv", "pinterest.com"],
    "apps": []
  },
  "typingCheers": true,
  "askShortcut": "CommandOrControl+Shift+Space",
  "askModel": "",
  "calendars": [],
  "meetingMinutesBefore": 5,
  "idleChatter": true,
  "systemNotifications": true,
  "sounds": true
}
```

- `name`: what Buddy calls you ("Good morning, Sam!").
- Set `lunch`, `dinner` or `bedtime` to `""` to turn that nudge off, and `breakEveryMinutes` or `waterEveryMinutes` to `0` to turn off stretch or water breaks.
- `askShortcut`: the keyboard shortcut for *Ask me anything*. Set it to `""` to turn it off. `askModel`: for example `"haiku"` for faster answers; leave it empty to use your Claude Code default.
- New settings from updates are added to your file automatically, so you can find them there.
- After `bedtime`, Buddy also looks sleepy.
- The morning, meal, bedtime and break nudges only fire while you're actually at your computer. Reminders fire regardless and wait for you.
- If you change `port`, restart Buddy, and set the `BUDDY_PORT` environment variable for `notify.js`.

## Notes

- **Linux:** transparent windows need a compositor. GNOME, KDE and most modern desktops have one. Without one, the flame sits on a black square.
- **macOS:** Buddy hides its Dock icon. To quit, right-click the flame (or click the menu bar icon) → **Bye for now**.
- Tests: `npm test`.

## Files

| File | What it does |
|---|---|
| `main.js` | Window, physics (gravity, bounces, throw, follow), daily schedule, water, distraction and typing checks, reminders, local server, menus |
| `renderer.js` | Face: eyes tracking, blinking, moods, speech bubble queue, sounds, reminder and ask forms |
| `index.html`, `style.css` | The flame (a single SVG) and all expressions |
| `ask.js` | *Ask me anything* → Claude Code |
| `calendar.js` | Reads meetings and call links from calendar (.ics) links (tested) |
| `activity.js` | Which app and website are in front |
| `habits.js` | Distraction and typing logic (tested) |
| `assets/` | Menu bar and app icons |
| `scripts/make-app.js` | `npm run app`: builds Buddy.app |
| `when.js` | Turns "1h30" or "2pm" into a time |
| `notify.js` | Claude Code hook → Buddy |
