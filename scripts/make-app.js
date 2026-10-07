#!/usr/bin/env node
// Builds Buddy as a normal app for this computer (`npm run app`).
// macOS: Buddy.app goes into your Applications folder, so you can open it from
// Launchpad or Spotlight like any other app. Run it again after `git pull`.

const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const packagerModule = require('@electron/packager');
const { compileHelper, NAME } = require('../apple');

const packager = packagerModule.packager || packagerModule;
const root = path.join(__dirname, '..');

async function main() {
  const mac = process.platform === 'darwin';
  // The Apple Calendar & Reminders helper is a tiny Swift program.
  const extraResource = [];
  if (mac) {
    const helper = path.join(root, 'dist', 'helper', NAME);
    try {
      console.log('Building the Apple Calendar helper…');
      compileHelper(helper);
      extraResource.push(helper);
    } catch (e) {
      console.warn('⚠️  Could not build the Apple Calendar helper, so Apple Calendar & Reminders won\'t work.');
      console.warn('   Install Xcode\'s command line tools with: xcode-select --install, then run npm run app again.');
      console.warn(`   (${String(e.stderr || e.message).trim().split('\n')[0]})`);
    }
  }

  console.log('Building Buddy… (the first time downloads Electron, ~100 MB)');
  const [outDir] = await packager({
    extraResource,
    dir: root,
    name: 'Buddy',
    out: path.join(root, 'dist'),
    overwrite: true,
    prune: true, // leave out dev-only packages
    asar: true,
    icon: path.join(root, 'assets', mac ? 'icon.icns' : 'icon.png'),
    appBundleId: 'com.axofox.buddy',
    ignore: [/^\/dist($|\/)/, /^\/docs($|\/)/, /^\/test($|\/)/, /^\/scripts($|\/)/, /^\/helpers($|\/)/, /^\/\.git/],
    extendInfo: {
      LSUIElement: true, // no Dock icon, just the menu bar flame
      // Shown when macOS asks whether Buddy may read your browser's tab (distraction nudges).
      NSAppleEventsUsageDescription: 'Buddy checks which website is open so it can nudge you after a long time on YouTube & co. Nothing is stored or sent anywhere.',
      NSCalendarsUsageDescription: 'Buddy reminds you of your meetings a few minutes before they start.',
      NSCalendarsFullAccessUsageDescription: 'Buddy reminds you of your meetings a few minutes before they start.',
      NSRemindersUsageDescription: 'Buddy pops up when one of your reminders is due.',
      NSRemindersFullAccessUsageDescription: 'Buddy pops up when one of your reminders is due.',
    },
  });

  if (!mac) {
    console.log(`\nDone! Buddy is in ${outDir}`);
    return;
  }

  // Applications is usually writable on a personal Mac; otherwise use ~/Applications.
  const built = path.join(outDir, 'Buddy.app');
  let target = '/Applications';
  try {
    fs.accessSync(target, fs.constants.W_OK);
  } catch {
    target = path.join(os.homedir(), 'Applications');
    fs.mkdirSync(target, { recursive: true });
  }
  const dest = path.join(target, 'Buddy.app');
  try {
    execFileSync('osascript', ['-e', 'tell application "Buddy" to quit'], { stdio: 'ignore' });
  } catch {
    /* it wasn't running */
  }
  fs.rmSync(dest, { recursive: true, force: true });
  execFileSync('ditto', [built, dest]); // copies the app bundle with everything intact
  console.log(`\nDone! Buddy is now in ${target}.`);
  console.log('Open it from Launchpad or Spotlight (⌘ Space, type "Buddy").');
  console.log('Tip: right-click the flame → "Start when I log in" so it\'s always there.');
}

main().catch((e) => {
  console.error('\nCould not build Buddy:', e.message);
  process.exit(1);
});
