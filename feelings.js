// Notices how a message *feels*, with plain word lists: no AI, nothing sent
// anywhere. Only used for what you type into Buddy's own box.

const WORDS = {
  joy: [
    'yay', 'yey', 'yeah', 'yippee', 'woohoo', 'wohoo', 'woo', 'hooray', 'hurray', 'joy', 'yes', 'yess', 'yesss',
    'awesome', 'amazing', 'great', 'love', 'happy', 'excited', 'perfect', 'wonderful', 'fantastic', 'brilliant',
    'nailed', 'finally', 'success', 'won', 'win', 'best', 'cool', 'nice', 'party', 'celebrate',
  ],
  angry: [
    'hate', 'ugh', 'argh', 'grr', 'grrr', 'damn', 'dammit', 'stupid', 'dumb', 'annoying', 'annoyed', 'sucks',
    'worst', 'terrible', 'awful', 'angry', 'mad', 'furious', 'shit', 'fuck', 'fucking', 'crap', 'wtf', 'idiot',
    'broken', 'useless', 'hell', 'pissed', 'rage', 'horrible',
  ],
  sad: [
    'sad', 'tired', 'exhausted', 'lonely', 'cry', 'crying', 'miss', 'depressed', 'down', 'upset', 'hurt',
    'sorry', 'bad', 'stressed', 'overwhelmed', 'anxious', 'worried', 'sick',
  ],
};

const PHRASES = {
  joy: ['let\'s go', 'lets go', 'i did it', 'we did it', 'it works'],
  angry: ['not working', 'doesn\'t work', 'does not work', 'didn\'t work', 'won\'t work', 'fed up'],
  sad: ['bad day', 'not okay', 'not ok', 'feel bad'],
};

const EMOJI = {
  joy: /[🎉🥳😄😁😆😍🤩❤️💖✨🙌]/u,
  angry: /[😡🤬😠💢]/u,
  sad: /[😢😭😞😔💔🥺]/u,
};

const NEGATIONS = new Set(['not', 'no', 'never', 'dont', 'don\'t', 'isnt', 'isn\'t', 'wasnt', 'wasn\'t', 'aint']);

function isQuestion(text) {
  return /\?\s*$/.test(String(text).trim()) || /\?/.test(String(text));
}

// Returns 'joy' | 'angry' | 'sad' | null.
function detectFeeling(text) {
  const t = String(text || '').toLowerCase();
  if (!t.trim()) return null;
  const score = { joy: 0, angry: 0, sad: 0 };
  for (const f of Object.keys(score)) {
    if (EMOJI[f].test(t)) score[f] += 2;
    for (const p of PHRASES[f]) if (t.includes(p)) score[f] += 2;
  }
  const tokens = t.replace(/[^a-z'\s]/g, ' ').split(/\s+/).filter(Boolean);
  tokens.forEach((w, i) => {
    // squash stretched words: "yaaay" -> "yay", "uuugh" -> "ugh"
    const base = w.replace(/(.)\1{2,}/g, '$1$1');
    const squashed = base.replace(/(.)\1+/g, '$1');
    const negated = NEGATIONS.has(tokens[i - 1]);
    for (const f of Object.keys(score)) {
      if (WORDS[f].includes(base) || WORDS[f].includes(squashed)) {
        // "not great" / "not bad" flip into something milder
        if (negated && f === 'joy') score.sad += 1;
        else if (!negated) score[f] += 1;
      }
    }
  });
  if (/!{2,}/.test(t)) {
    if (score.joy >= score.angry && score.joy > 0) score.joy += 1;
    else if (score.angry > 0) score.angry += 1;
  }
  const best = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
  if (best[1] === 0) return null;
  // an angry word always wins a tie with joy ("I love how this stupid thing broke")
  if (score.angry && score.angry >= score.joy && score.angry >= score.sad) return 'angry';
  return best[0];
}

module.exports = { detectFeeling, isQuestion };
