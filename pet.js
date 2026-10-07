// The growing pet: Buddy collects ✨ sparks when you look after yourself and
// grows through the stages of its current "life". At the end of a life it can
// transform into something new. No AI: just counting.

const LIVES = {
  // Every life starts as a tiny dot and grows in five stages.
  flame: { emoji: '🔥', name: 'fire', stages: ['Dot', 'Spark', 'Kindle', 'Flame', 'Blaze'] },
  leaf: { emoji: '🌱', name: 'leaf', stages: ['Dot', 'Seed', 'Sprout', 'Leafy', 'Blossom'] },
  monster: { emoji: '👾', name: 'little monster', stages: ['Dot', 'Egg', 'Hatchling', 'Monster', 'Big monster'] },
  frog: { emoji: '🐸', name: 'frog', stages: ['Dot', 'Frogspawn', 'Tadpole', 'Froglet', 'Frog'] },
  cat: { emoji: '🐱', name: 'cat', stages: ['Dot', 'Kitten ball', 'Kitten', 'Cat', 'Big cat'] },
};

// Sparks needed (within a life) for each stage, and to be ready to transform.
const THRESHOLDS = [0, 15, 50, 120, 250];
const READY_AT = 450;

// What earns sparks.
const SPARKS = {
  waters: 3, breaks: 3, typingStreak: 2, meetings: 2, morning: 2, reminders: 1, claude: 1, joy: 1,
};

function stageFor(xp) {
  let s = 0;
  THRESHOLDS.forEach((t, i) => { if (xp >= t) s = i; });
  return s;
}

function newPet(life = 'flame') {
  return { life, xp: 0, stage: 0, lives: [life] };
}

// Normalises a saved pet (or nothing) into a valid one.
function loadPet(saved) {
  if (!saved || !LIVES[saved.life]) return newPet();
  const xp = Math.max(0, Number(saved.xp) || 0);
  return { life: saved.life, xp, stage: stageFor(xp), lives: Array.isArray(saved.lives) ? saved.lives : [saved.life] };
}

// Adds sparks. Returns the events to celebrate: 'grew' and/or 'ready'.
function addSparks(pet, n) {
  const before = pet.xp;
  pet.xp += n;
  const events = [];
  const stage = stageFor(pet.xp);
  if (stage > pet.stage) {
    pet.stage = stage;
    events.push('grew');
  }
  if (before < READY_AT && pet.xp >= READY_AT) events.push('ready');
  return events;
}

function isReady(pet) {
  return pet.xp >= READY_AT;
}

function transform(pet, life) {
  if (!LIVES[life]) return pet;
  return { life, xp: 0, stage: 0, lives: [...(pet.lives || []), life] };
}

// "Kindle · 57/80 ✨" style progress.
function progress(pet) {
  const next = pet.stage < THRESHOLDS.length - 1 ? THRESHOLDS[pet.stage + 1] : READY_AT;
  return { name: LIVES[pet.life].stages[pet.stage], emoji: LIVES[pet.life].emoji, xp: pet.xp, next, ready: isReady(pet) };
}

module.exports = {
  LIVES, THRESHOLDS, READY_AT, SPARKS, stageFor, newPet, loadPet, addSparks, isReady, transform, progress,
};
