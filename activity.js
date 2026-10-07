// What's in front right now? Returns { app, url, title } (fields may be empty).
//
// macOS: the app name needs no permission. For the browser tab, macOS asks
// once whether Buddy may "control" your browser; if you say no, Buddy only
// knows the app name. Linux: uses xdotool if installed (window title only).

const { execFile } = require('child_process');

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 3000 }, (err, out) => resolve(err ? '' : String(out).trim()));
  });
}

// AppleScript that returns the front tab's URL, per browser family.
const MAC_BROWSERS = {
  'Google Chrome': 'URL of active tab of front window',
  'Google Chrome Canary': 'URL of active tab of front window',
  Chromium: 'URL of active tab of front window',
  'Brave Browser': 'URL of active tab of front window',
  'Microsoft Edge': 'URL of active tab of front window',
  Vivaldi: 'URL of active tab of front window',
  Arc: 'URL of active tab of front window',
  Safari: 'URL of current tab of front window',
  'Safari Technology Preview': 'URL of current tab of front window',
};

const denied = new Set(); // browsers we may not ask again this run

async function macActivity() {
  let app = '';
  const info = await run('/bin/sh', ['-c', 'lsappinfo info -only name "$(lsappinfo front)"']);
  const m = info.match(/"(?:LSDisplayName|name)"\s*=\s*"([^"]*)"/i);
  if (m) app = m[1];
  if (!app) {
    app = await run('osascript', ['-e',
      'tell application "System Events" to get name of first application process whose frontmost is true']);
  }
  let url = '';
  const script = MAC_BROWSERS[app];
  if (script && !denied.has(app)) {
    url = await run('osascript', ['-e', `tell application "${app}" to get ${script}`]);
    if (!url) denied.add(app);
    // Allow another try later: maybe there just was no window open.
    setTimeout(() => denied.delete(app), 10 * 60000).unref();
  }
  return { app, url, title: '' };
}

async function linuxActivity() {
  const title = await run('xdotool', ['getactivewindow', 'getwindowname']);
  return { app: '', url: '', title };
}

async function currentActivity() {
  if (process.platform === 'darwin') return macActivity();
  if (process.platform === 'linux') return linuxActivity();
  return { app: '', url: '', title: '' };
}

module.exports = { currentActivity };
