/** Удаляет рекламные блоки из data/theory/chapters/*.json */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'data', 'theory', 'chapters');
const JUNK = /РЕШАТЬ БИЛЕТЫ|ЭКЗАМЕН ПДД|Понравился сайт|Поделиться|Оплата.*Премиум|^Правила Дорожного Движения ПМР\.?$/i;

let total = 0;
for (const file of fs.readdirSync(DIR).filter(f => f.endsWith('.json'))) {
  const p = path.join(DIR, file);
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  const before = data.blocks.length;
  data.blocks = data.blocks.filter(b => !JUNK.test(b.text || ''));
  total += before - data.blocks.length;
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
}
console.log(`Удалено блоков: ${total}`);
