const test = require('node:test');
const assert = require('node:assert');
const {
  newPet, loadPet, addSparks, transform, progress, READY_AT,
} = require('../pet');

test('grows through the stages and becomes ready to transform', () => {
  const p = newPet();
  assert.deepStrictEqual(progress(p), { name: 'Dot', emoji: '🔥', xp: 0, next: 15, ready: false });
  assert.deepStrictEqual(addSparks(p, 10), []);
  assert.deepStrictEqual(addSparks(p, 5), ['grew']);
  assert.strictEqual(progress(p).name, 'Spark');
  addSparks(p, 235); // 250
  assert.strictEqual(progress(p).name, 'Blaze');
  assert.deepStrictEqual(addSparks(p, READY_AT - 250), ['ready']);
  assert.deepStrictEqual(addSparks(p, 10), []); // only once
  assert.strictEqual(progress(p).ready, true);
});

test('a big jump can grow and be ready at once', () => {
  assert.deepStrictEqual(addSparks(newPet(), 500), ['grew', 'ready']);
});

test('transforming starts a new life', () => {
  const p = transform(newPet(), 'frog');
  assert.deepStrictEqual(progress(p), { name: 'Dot', emoji: '🐸', xp: 0, next: 15, ready: false });
  assert.deepStrictEqual(p.lives, ['flame', 'frog']);
  assert.strictEqual(transform(p, 'dragon'), p); // unknown lives are ignored
});

test('loads saved pets safely', () => {
  assert.deepStrictEqual(loadPet(null), newPet());
  assert.deepStrictEqual(loadPet({ life: 'nope' }), newPet());
  assert.strictEqual(loadPet({ life: 'cat', xp: 90 }).stage, 2);
  assert.strictEqual(loadPet({ life: 'cat', xp: 300 }).stage, 4);
});
