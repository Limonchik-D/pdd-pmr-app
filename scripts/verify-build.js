/** Автопроверка сборки ПДД ПМР */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'manifest.json'), 'utf8'));
const signsMap = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'signs-map.json'), 'utf8'));

let errors = 0;
let warnings = 0;

for (const cat of manifest.categories) {
  const fp = path.join(ROOT, 'data', cat.dataFile);
  if (!fs.existsSync(fp)) {
    console.error('✗ Нет файла:', cat.dataFile);
    errors++;
    continue;
  }
  const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
  if (data.questions.length > 30) {
    console.error(`✗ >30 вопросов: ${cat.id} (${data.questions.length})`);
    errors++;
  }
  if (data.questions.length !== cat.questionCount) {
    console.warn(`⚠ Счётчик manifest: ${cat.id} manifest=${cat.questionCount} file=${data.questions.length}`);
    warnings++;
  }
}

const sampleSigns = ['5.1', '4.4.1', '1.1', '3.27'];
for (const s of sampleSigns) {
  if (!signsMap[s]) {
    console.error('✗ Нет знака в map:', s);
    errors++;
  }
}

const gp = path.join(ROOT, 'data', 'theory', 'chapters', 'general-provisions.json');
const gpData = JSON.parse(fs.readFileSync(gp, 'utf8'));
const has51 = gpData.blocks.some(b => (b.text || '').includes('5.1'));
if (!has51) {
  console.warn('⚠ general-provisions: нет упоминания знака 5.1');
  warnings++;
}

console.log(`\nТем: ${manifest.categories.length}, вопросов: ${manifest.stats.questions}, знаков: ${Object.keys(signsMap).length}`);

const ticketsMan = path.join(ROOT, 'data', 'tickets', 'manifest.json');
if (fs.existsSync(ticketsMan)) {
  const tm = JSON.parse(fs.readFileSync(ticketsMan, 'utf8'));
  for (const t of tm.tickets || []) {
    const fp = path.join(ROOT, 'data', t.dataFile);
    if (!fs.existsSync(fp)) { console.error('✗ Нет билета:', t.dataFile); errors++; continue; }
    const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
    if (data.questions?.length !== 20) {
      console.error(`✗ Билет ${t.number}: ${data.questions?.length} вопросов`);
      errors++;
    }
  }
  console.log(`Билетов: ${tm.tickets?.length || 0}`);
} else {
  console.error('✗ Нет data/tickets/manifest.json — запустите node scripts/build-tickets.js');
  errors++;
}

if (errors) {
  console.error(`\n❌ Ошибок: ${errors}, предупреждений: ${warnings}`);
  process.exit(1);
}
console.log(`\n✅ Проверка пройдена (предупреждений: ${warnings})`);
