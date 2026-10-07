const test = require('node:test');
const assert = require('node:assert');
const { cleanAnswer } = require('../ask');

test('answers are cleaned for the bubble', () => {
  assert.strictEqual(cleanAnswer('## Hi\n**Bold** move\n\n\n\nok\n'), 'Hi\nBold move\n\nok');
});
