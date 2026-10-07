// "Ask me anything" with a local AI through Ollama (https://ollama.com).
// Everything stays on this computer: Ollama listens on localhost only.

const OLLAMA = process.env.BUDDY_OLLAMA_URL || 'http://127.0.0.1:11434';

const SYSTEM = [
  'You are Buddy, a tiny friendly flame that lives on the user\'s desktop.',
  'Your answer appears in a small speech bubble, so keep it short: 1 to 4 sentences,',
  'plain text only, no markdown. If you are not sure about something, say so.',
].join(' ');

// history: earlier [{ role, content }] turns, for follow-up questions.
// Resolves { ok, text, notRunning?, noModel? } and never rejects.
async function askLocal(question, { model = 'llama3.2:3b', history = [], timeoutMs = 180000 } = {}) {
  const messages = [{ role: 'system', content: SYSTEM }, ...history, { role: 'user', content: question }];
  let res;
  try {
    res = await fetch(`${OLLAMA}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    if (e.name === 'TimeoutError') return { ok: false, text: 'The local AI took too long, sorry! 🐢' };
    return { ok: false, notRunning: true, text: e.message };
  }
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* handled below */
  }
  if (res.status === 404 || /not found/i.test(data.error || '')) {
    return { ok: false, noModel: true, text: data.error || 'model not found' };
  }
  const text = data.message && typeof data.message.content === 'string' ? data.message.content.trim() : '';
  if (!res.ok || !text) return { ok: false, text: data.error || `Ollama answered ${res.status}` };
  return { ok: true, text };
}

module.exports = { askLocal, OLLAMA };
