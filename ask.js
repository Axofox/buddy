// "Ask me anything": sends the question to Claude Code (`claude -p`), which
// you already have and are logged in to, and returns a short answer.

const { spawn, execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { isFile } = require('./sys');

// Who Buddy is, for any AI that answers for it (Claude here, Ollama in local-ai.js).
const PERSONA = [
  'You are Buddy, a tiny friendly flame that lives on the user\'s desktop.',
  'Your answer appears in a small speech bubble, so keep it short: 1 to 4 sentences,',
  'plain text only, no markdown, no headings, no code blocks unless asked for code.',
  'Be warm and direct.',
].join(' ');
const SYSTEM = `${PERSONA} You may look things up on the web if needed.`;

// When launched from Finder or at login, PATH is minimal, so also look where
// Claude Code usually lives.
function searchPath() {
  const home = os.homedir();
  const extra = [
    path.join(home, '.claude', 'local'),
    path.join(home, '.local', 'bin'),
    path.join(home, '.npm-global', 'bin'),
    path.join(home, '.volta', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ];
  return [process.env.PATH || '', ...extra].join(path.delimiter);
}

// Every place Claude Code might live: PATH, the usual install folders, and
// npm installs under nvm/fnm.
function candidates() {
  const home = os.homedir();
  const dirs = searchPath().split(path.delimiter).filter(Boolean);
  for (const base of [path.join(home, '.nvm', 'versions', 'node'), path.join(home, '.fnm', 'node-versions')]) {
    try {
      for (const v of fs.readdirSync(base)) {
        dirs.push(path.join(base, v, 'bin'), path.join(base, v, 'installation', 'bin'));
      }
    } catch {
      /* not installed */
    }
  }
  return dirs.map((d) => path.join(d, 'claude'));
}

// Last resort: ask your login shell, which knows the PATH your Terminal uses.
function fromLoginShell() {
  const sh = process.env.SHELL || '/bin/zsh';
  return new Promise((resolve) => {
    execFile(sh, ['-ilc', 'command -v claude'], { timeout: 8000 }, (err, out) => {
      const line = String(out || '').trim().split('\n').pop();
      resolve(!err && line.startsWith('/') && isFile(line) ? line : null);
    });
  });
}

let found = null;
async function findClaude() {
  if (process.platform === 'win32') return 'claude'; // cmd.exe searches PATH itself
  if (found && isFile(found)) return found;
  found = candidates().find(isFile) || await fromLoginShell();
  return found;
}

function cleanAnswer(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^#+\s*/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 1500);
}

// Asks Claude. `followUp` continues the previous little conversation.
// Resolves { ok, text } and never rejects.
async function askClaude(question, opts = {}) {
  const bin = await findClaude();
  if (!bin) return { ok: false, text: 'claude not found', missing: true };
  return runClaude(bin, question, opts);
}

function runClaude(bin, question, { cwd, followUp = false, model = '', timeoutMs = 120000 } = {}) {
  return new Promise((resolve) => {
    try {
      fs.mkdirSync(cwd, { recursive: true });
    } catch {
      /* spawn will complain if it really doesn't exist */
    }
    const args = ['-p', '--output-format', 'text', '--append-system-prompt', SYSTEM];
    if (followUp) args.push('--continue');
    if (model) args.push('--model', model);
    args.push('--allowedTools', 'WebSearch', 'WebFetch');

    // Windows runs this through cmd.exe, which needs spaces quoted.
    const argv = process.platform === 'win32'
      ? args.map((x) => (/[\s"]/.test(x) ? `"${x.replace(/"/g, '\\"')}"` : x))
      : args;

    let child;
    try {
      child = spawn(bin, argv, {
        cwd,
        env: { ...process.env, PATH: searchPath() },
        shell: process.platform === 'win32',
        windowsHide: true,
      });
    } catch (e) {
      resolve({ ok: false, text: e.message, missing: true });
      return;
    }

    let out = '';
    let err = '';
    let done = false;
    const finish = (r) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(r);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish({ ok: false, text: 'That took too long, sorry! Try asking again? 🙈' });
    }, timeoutMs);

    child.stdout.on('data', (c) => { out += c; });
    child.stderr.on('data', (c) => { err += c; });
    child.on('error', (e) => finish({ ok: false, text: e.message, missing: e.code === 'ENOENT' }));
    child.on('close', (code) => {
      if (code === 0 && out.trim()) finish({ ok: true, text: cleanAnswer(out) });
      else finish({ ok: false, text: (err || out).trim().split('\n')[0] || `Claude stopped (code ${code})` });
    });
    // The question goes in on stdin, so no shell quoting can mangle it.
    child.stdin.end(question);
  });
}

module.exports = {
  askClaude, cleanAnswer, findClaude, PERSONA,
};
