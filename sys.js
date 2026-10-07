// Small helpers for talking to the operating system, shared by several files.

const { execFile } = require('child_process');
const fs = require('fs');

// Runs a command and resolves its output, or '' if it fails. Never rejects.
function run(cmd, args, { timeout = 3000 } = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout }, (err, out) => resolve(err ? '' : String(out).trim()));
  });
}

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

module.exports = { run, isFile };
