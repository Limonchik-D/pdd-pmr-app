/**
 * Глобальный поисковый индекс: темы, теория, вопросы, пункты ПДД.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TESTS = path.join(ROOT, 'data', 'tests');
const THEORY = path.join(ROOT, 'data', 'theory', 'chapters');
const MANIFEST = path.join(ROOT, 'data', 'manifest.json');
const THEORY_TOC = path.join(ROOT, 'data', 'theory', 'toc.json');
const OUT = path.join(ROOT, 'data', 'global-search.json');

function stripHtml(s) {
  return (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractPddPoints(text) {
  const pts = new Set();
  const re = /(?:п\.?\s*|пункт\s+|раздел\s+|§\s*)?(\d{1,2}\.\d+(?:\.\d+)?(?:\s*[–—-]\s*\d{1,2}\.\d+(?:\.\d+)?)?)/gi;
  let m;
  while ((m = re.exec(text || ''))) {
    m[1].split(/\s*[–—-]\s*/).forEach(p => pts.add(p.trim()));
  }
  return [...pts];
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const theoryToc = JSON.parse(fs.readFileSync(THEORY_TOC, 'utf8'));

const topics = manifest.categories.filter(c => c.questionCount > 0).map(c => ({
  type: 'topic',
  id: c.id,
  title: c.title,
  desc: c.desc || '',
  icon: c.icon || '📝',
  group: c.group,
  pddPoints: [],
  text: `${c.title} ${c.desc || ''}`.toLowerCase(),
}));

const theory = [];
for (const ch of theoryToc.chapters) {
  const fp = path.join(THEORY, `${ch.id}.json`);
  if (!fs.existsSync(fp)) continue;
  const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const body = (data.blocks || []).map(b => stripHtml(b.text)).join(' ');
  const pddPoints = extractPddPoints(body);
  theory.push({
    type: 'theory',
    id: ch.id,
    title: data.title || ch.title,
    section: ch.section || '',
    pddPoints,
    primaryPoints: ch.section ? [ch.section] : pddPoints.slice(0, 3),
    text: body.toLowerCase(),
  });
}

const questions = [];
for (const file of fs.readdirSync(TESTS).filter(f => f.endsWith('.json'))) {
  const data = JSON.parse(fs.readFileSync(path.join(TESTS, file), 'utf8'));
  const cat = manifest.categories.find(c => c.id === data.id);
  for (const q of data.questions || []) {
    const blob = `${q.text || ''} ${(q.answers || []).join(' ')} ${q.explanation || ''}`;
    questions.push({
      type: 'question',
      id: `${data.id}:${q.id}`,
      topicId: data.id,
      topicTitle: data.title,
      icon: cat?.icon || '❓',
      text: blob.toLowerCase(),
      preview: (q.text || '').slice(0, 120),
      pddPoints: extractPddPoints(blob),
    });
  }
}

fs.writeFileSync(OUT, JSON.stringify({
  version: 1,
  topics,
  theory,
  questions,
}, null, 2), 'utf8');

console.log(`Индекс: ${topics.length} тем, ${theory.length} глав, ${questions.length} вопросов`);
