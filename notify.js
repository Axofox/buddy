#!/usr/bin/env node
// Claude Code hook -> buddy. Reads the hook's JSON from stdin and forwards it
// to the buddy on localhost. Never fails and never blocks Claude: if the buddy
// isn't running, it quietly does nothing.
//
// Usage in ~/.claude/settings.json:  "command": "node /path/to/buddy/notify.js"

const http = require('http');

const port = Number(process.env.BUDDY_PORT) || 47321;
let input = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => {
  input += c;
});
process.stdin.on('end', () => {
  const req = http.request(
    {
      host: '127.0.0.1',
      port,
      path: '/claude',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 1500,
    },
    (res) => {
      res.resume();
      res.on('end', () => process.exit(0));
    },
  );
  req.on('error', () => process.exit(0));
  req.on('timeout', () => {
    req.destroy();
    process.exit(0);
  });
  req.end(input || '{}');
});
setTimeout(() => process.exit(0), 3000).unref();
