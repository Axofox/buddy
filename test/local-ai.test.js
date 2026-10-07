const test = require('node:test');
const assert = require('node:assert');
const http = require('http');

// A tiny stand-in for Ollama's /api/chat.
function fakeOllama(handler) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => handler(JSON.parse(body), res));
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function load(port) {
  process.env.BUDDY_OLLAMA_URL = `http://127.0.0.1:${port}`;
  delete require.cache[require.resolve('../local-ai')];
  return require('../local-ai');
}

test('asks the local model, with history for follow-ups', async () => {
  let seen;
  const server = await fakeOllama((req, res) => {
    seen = req;
    res.end(JSON.stringify({ message: { role: 'assistant', content: '  Because of Rayleigh scattering.  ' } }));
  });
  const { askLocal } = load(server.address().port);
  const history = [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello!' }];
  const r = await askLocal('why is the sky blue?', { model: 'llama3.2:3b', history });
  server.close();
  assert.deepStrictEqual(r, { ok: true, text: 'Because of Rayleigh scattering.' });
  assert.strictEqual(seen.model, 'llama3.2:3b');
  assert.strictEqual(seen.stream, false);
  assert.deepStrictEqual(seen.messages.map((m) => m.role), ['system', 'user', 'assistant', 'user']);
});

test('tells apart "Ollama not running" and "model missing"', async () => {
  const server = await fakeOllama((req, res) => {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: `model "${req.model}" not found, try pulling it first` }));
  });
  const { askLocal } = load(server.address().port);
  const missing = await askLocal('hi', { model: 'nope' });
  const { port } = server.address();
  server.close();
  assert.strictEqual(missing.noModel, true);

  const off = await load(port).askLocal('hi');
  assert.strictEqual(off.ok, false);
  assert.strictEqual(off.notRunning, true);
});
