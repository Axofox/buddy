# Buddy

A little bouncing ball with eyes that lives on your desktop. It:

- **tells you when Claude Code needs you** (a permission prompt, or Claude waiting for input) and when Claude is done
- **says good morning** the first time you're at your computer each day
- **reminds you to eat** at lunch and dinner time
- **tells you when it's late** and keeps nudging every 30 minutes until you go to bed
- **suggests a stretch break** when you've been at it for a long time
- **remembers reminders** you give it ("tea in 10m", "call mom at 18:30")
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

The ball appears near the bottom-right of your screen and says hi.

## Playing with it

| Do this | What happens |
|---|---|
| **Click** the ball | It giggles. Poke it a lot and it gets grumpy. |
| **Drag and throw** it | It flies and bounces off the screen edges. |
| **Right-click** it | Menu: *Bounce around*, *Follow me*, *Sit still*, *Sleep*, *Add reminder…*, your reminders list, sounds, start at login, settings, quit |
| **Click a bubble** with an orange border | Dismisses it. Important messages stay until you click them. |

When something important comes in (Claude needs you, or a reminder is due), it turns orange, shows a **!**, jiggles, plays a little sound, and in *Bounce* mode hops toward your mouse until you click it.

### Reminders

Right-click → **Add reminder…**, type what and when, then press Enter. Esc cancels.

You can write the time as `10m`, `45 min`, `1h30`, `in 2 hours`, `14:30`, `2pm` or `tomorrow 9am`. A bare number means minutes.

Reminders are saved, so they survive a restart. To cancel one, right-click → **Reminders**.

## Connect it to Claude Code

Claude Code can run a command on certain events (a feature called *hooks*). Buddy comes with `notify.js`, which forwards those events to the ball. It finishes instantly and never blocks Claude, even when Buddy isn't running.

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
| `Notification` (needs permission, or waiting for you) | 🙋 orange alert that stays until you click it, plus an OS notification. The project folder name is shown. |
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
  "color": "#6ec6ff",
  "startMode": "bounce",
  "morning": { "from": "05:00", "to": "11:30" },
  "lunch": "12:30",
  "dinner": "19:00",
  "bedtime": "23:00",
  "bedtimeUntil": "04:00",
  "bedtimeRepeatMinutes": 30,
  "breakEveryMinutes": 90,
  "idleChatter": true,
  "systemNotifications": true,
  "sounds": true
}
```

- `name`: what Buddy calls you ("Good morning, Sam!").
- Set `lunch`, `dinner` or `bedtime` to `""` to turn that nudge off, and `breakEveryMinutes` to `0` to turn off stretch breaks.
- After `bedtime`, Buddy also looks sleepy.
- The morning, meal, bedtime and break nudges only fire while you're actually at your computer. Reminders fire regardless and wait for you.
- If you change `port`, restart Buddy, and set the `BUDDY_PORT` environment variable for `notify.js`.

## Notes

- **Linux:** transparent windows need a compositor. GNOME, KDE and most modern desktops have one. Without one, the ball sits on a black square.
- **macOS:** Buddy hides its Dock icon. To quit, right-click the ball → **Bye for now**.
- Tests for the reminder time parser: `npm test`.

## Files

| File | What it does |
|---|---|
| `main.js` | Window, physics (gravity, bounces, throw, follow), daily schedule, reminders, local server, menu |
| `renderer.js` | Face: eyes tracking, blinking, moods, speech bubble queue, sounds, reminder form |
| `index.html`, `style.css` | The ball (a single SVG) and all expressions |
| `when.js` | Turns "1h30" or "2pm" into a time |
| `notify.js` | Claude Code hook → Buddy |
