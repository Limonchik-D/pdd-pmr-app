/**
 * Синхронизация исправленных вопросов «Ответственность» в билеты.
 * Сопоставление по тексту вопроса (первые 80 символов).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'data', 'tests', 'responsibility.json');
const ticketsDir = path.join(ROOT, 'data', 'tickets');

const fixed = JSON.parse(fs.readFileSync(SRC, 'utf8'));

function norm(text) {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

const byText = new Map(
  fixed.questions.flatMap(q => {
    const keys = [q.text.slice(0, 80), q.text.slice(0, 60), norm(q.text).slice(0, 80)];
    return keys.map(k => [k, q]);
  })
);

function findMatch(q) {
  const keys = [q.text.slice(0, 80), q.text.slice(0, 60), norm(q.text).slice(0, 80)];
  for (const k of keys) {
    const src = byText.get(k);
    if (src) return src;
  }
  if (/ответственност|штраф|лишен|арест|осаго|страхован|дтп|опьянен|медосвидетельств|уголовн/i.test(q.text)) {
    for (const src of fixed.questions) {
      const a = norm(q.text);
      const b = norm(src.text);
      if (a.includes(b.slice(0, 40)) || b.includes(a.slice(0, 40))) return src;
    }
  }
  return null;
}

let patched = 0;
for (let n = 1; n <= 40; n++) {
  const fp = path.join(ticketsDir, `${String(n).padStart(2, '0')}.json`);
  const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
  let changed = false;
  data.questions = data.questions.map(q => {
    const src = findMatch(q);
    if (!src) return q;
    changed = true;
    patched++;
    return { ...q, answers: [...src.answers], correct: src.correct, explanation: src.explanation };
  });
  if (changed) fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf8');
}
console.log(`Обновлено вопросов в билетах: ${patched}`);
