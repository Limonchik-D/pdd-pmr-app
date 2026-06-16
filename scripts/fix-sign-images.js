/**
 * Удаляет ошибочно назначенные SVG-знаки (из-за совпадения с номерами пунктов ПДД).
 */
const fs = require('fs');
const path = require('path');
const { shouldKeepSignImage } = require('./extract-sign-numbers');

const ROOT = path.join(__dirname, '..');
const dirs = [
  path.join(ROOT, 'data', 'tests'),
  path.join(ROOT, 'data', 'tickets'),
];

let fixed = 0;
for (const dir of dirs) {
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
    const fp = path.join(dir, file);
    const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
    if (!data.questions) continue;
    let changed = false;
    data.questions = data.questions.map(q => {
      if (q.image && !shouldKeepSignImage(q)) {
        changed = true;
        fixed++;
        return { ...q, image: '', sign: '' };
      }
      return q;
    });
    if (changed) fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf8');
  }
}
console.log(`Удалено ошибочных картинок знаков: ${fixed}`);
