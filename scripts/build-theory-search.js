/** data/theory/search-index.json — полнотекстовый поиск по теории */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CH_DIR = path.join(ROOT, 'data', 'theory', 'chapters');
const OUT = path.join(ROOT, 'data', 'theory', 'search-index.json');

function stripHtml(s) {
  return (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

const chapters = [];
for (const file of fs.readdirSync(CH_DIR).filter(f => f.endsWith('.json'))) {
  const ch = JSON.parse(fs.readFileSync(path.join(CH_DIR, file), 'utf8'));
  const text = (ch.blocks || [])
    .map(b => stripHtml(b.text || ''))
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  chapters.push({ id: ch.id || file.replace('.json', ''), title: ch.title || '', text });
}

fs.writeFileSync(OUT, JSON.stringify({ version: 1, chapters }, null, 2), 'utf8');
console.log(`Поисковый индекс: ${chapters.length} глав`);
