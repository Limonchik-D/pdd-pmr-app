/**
 * Сборка data/tickets/*.json — 40 экзаменационных билетов по 20 вопросов (МРЭО ГАИ)
 * Источник: pdd_russia-master/questions/A_B/tickets
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC_TICKETS = path.join(ROOT, 'pdd_russia-master', 'pdd_russia-master', 'questions', 'A_B', 'tickets');
const SIGNS_META = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'pdd_russia-master', 'pdd_russia-master', 'signs', 'signs.json'), 'utf8'
));
const OUT = path.join(ROOT, 'data', 'tickets');
const { adaptPmr } = require('./adapt-pmr');
const { extractSignNumbers } = require('./extract-sign-numbers');

function imagePath(raw) {
  if (!raw || raw.includes('no_image')) return '';
  const name = path.basename(raw);
  if (/\.(jpg|jpeg|png)$/i.test(name)) return `images/A_B/${name}`;
  return '';
}

function signSvg(signNum) {
  for (const group of Object.values(SIGNS_META)) {
    if (group[signNum]?.image) {
      return group[signNum].image.replace('./images/signs/', 'images/signs/');
    }
  }
  return '';
}

function convertQuestion(q, idx) {
  const tip = q.answer_tip || '';
  const sign = extractSignNumbers(q.question)[0] || '';
  const answers = q.answers.map(a => a.answer_text);
  const correct = q.answers.findIndex(a => a.is_correct);
  let image = imagePath(q.image);
  if (!image && sign) image = signSvg(sign);
  return {
    id: idx + 1,
    sign,
    text: q.question.trim(),
    image,
    answers,
    correct: correct >= 0 ? correct : 0,
    explanation: adaptPmr(tip),
    topic: Array.isArray(q.topic) ? q.topic[0] : '',
  };
}

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const manifestTickets = [];
let errors = 0;

for (let n = 1; n <= 40; n++) {
  const srcFile = path.join(SRC_TICKETS, `Билет ${n}.json`);
  if (!fs.existsSync(srcFile)) {
    console.error('✗ Нет файла:', srcFile);
    errors++;
    continue;
  }
  const raw = JSON.parse(fs.readFileSync(srcFile, 'utf8'));
  const questions = raw.map((q, i) => convertQuestion(q, i));
  if (questions.length !== 20) {
    console.error(`✗ Билет ${n}: ${questions.length} вопросов (ожидалось 20)`);
    errors++;
  }
  const id = String(n).padStart(2, '0');
  const out = { number: n, title: `Билет № ${n}`, questionCount: questions.length, questions };
  fs.writeFileSync(path.join(OUT, `${id}.json`), JSON.stringify(out, null, 2), 'utf8');
  manifestTickets.push({ number: n, id, title: out.title, questionCount: questions.length, dataFile: `tickets/${id}.json` });
  console.log(`Билет ${String(n).padStart(2)}: ${questions.length} вопросов`);
}

const manifest = {
  version: 1,
  source: 'ПДД ПМР — экзаменационные билеты (адаптация pdd_russia A_B)',
  ticketCount: 40,
  questionCount: 20,
  tickets: manifestTickets,
};

fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
console.log(`\nГотово: ${manifestTickets.length} билетов`);

if (errors) process.exit(1);
