'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { shuffle, makeQuestion } = require('../dist/quiz-session.js');
const bank = JSON.parse(fs.readFileSync(path.join(__dirname, '../dist/questions.json'), 'utf8'));
const original = JSON.stringify(bank);

// All 24 Fisher-Yates outcomes, including the unchanged ordering.
const draws = [];
for (let a = 0; a < 4; a++) for (let b = 0; b < 3; b++) for (let c = 0; c < 2; c++) draws.push([a / 4, b / 3, c / 2]);
const randomFor = values => { let i = 0; return () => values[i++]; };
const permutations = new Set();
const positions = new Set();
for (const values of draws) {
  permutations.add(shuffle(['A', 'B', 'C', 'D'], randomFor(values)).join(''));
  const specimen = { question: 'Chọn phương án A hoặc B.', options: [
    { id: 'A', text: 'C. Mác' }, { id: 'B', text: 'Đường cách mệnh' },
    { id: 'C', text: 'Nội dung thứ ba' }, { id: 'D', text: 'Cả A và B' }
  ], correctAnswers: ['A'] };
  const order = shuffle(specimen.options, randomFor(values));
  const labels = Object.fromEntries(order.map((o, i) => [o.id, 'ABCD'[i]]));
  const view = makeQuestion(specimen, true, randomFor(values));
  assert.equal(view.options.find(o => o.text === 'C. Mác').id, labels.A);
  assert.equal(view.correctAnswers[0], labels.A);
  assert.equal(view.question, `Chọn phương án ${labels.A} hoặc ${labels.B}.`);
  assert.equal(view.options.find(o => o.id === labels.D).text, `Cả ${labels.A} và ${labels.B}`);
  positions.add(view.correctAnswers[0]);
}
assert.equal(permutations.size, 24);
assert.equal(positions.size, 4);

for (const q of bank.questions) {
  assert.strictEqual(makeQuestion(q, false), q);
  for (const values of draws) {
    const order = shuffle(q.options, randomFor(values));
    const labels = Object.fromEntries(order.map((o, i) => [o.id, 'ABCD'[i]]));
    const view = makeQuestion(q, true, randomFor(values));
    assert.deepEqual(view.options.map(o => o.id), ['A', 'B', 'C', 'D']);
    assert.deepEqual(view.correctAnswers, q.correctAnswers.map(a => labels[a]));
    assert.equal(view.options.length, q.options.length);
    for (const source of q.options) {
      const shown = view.options.find(o => o.id === labels[source.id]);
      if (/\b[ABCD](?:\s*(?:,|\/|và|hoặc)\s*[ABCD])+\b/u.test(source.text)) {
        // Referenced contents must still be the same source options after relabeling.
        const expected = source.text.replace(/\b[ABCD]\b(?!\p{L})/gu, a => labels[a]);
        assert.equal(shown.text, expected, `Question ${q.id}: choice references`);
      } else if (/\s+trên$/u.test(source.text) && /^(Cả|Tất cả)/u.test(source.text)) {
        assert.equal(shown.text, source.text.replace(/trên$/u, 'còn lại'));
      } else {
        assert.equal(shown.text, source.text, `Question ${q.id}: source text`);
      }
    }
  }
}
assert.equal(JSON.stringify(bank), original, 'Source bank must remain unchanged');
console.log(`PASS: all 24 permutations across ${bank.questions.length} questions; answer keys, references, names and source data preserved`);
