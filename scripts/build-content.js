/**
 * Генерация data/content.json из pdd_russia-master + signs.json
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'pdd_russia-master', 'pdd_russia-master');
const OUT = path.join(ROOT, 'data', 'content.json');
const EXISTING = JSON.parse(fs.readFileSync(OUT, 'utf8'));

const SIGNS_PATH = path.join(SRC, 'questions', 'A_B', 'topics', 'Дорожные знаки.json');
const MARKING_PATH = path.join(SRC, 'questions', 'A_B', 'topics', 'Дорожная разметка.json');
const SIGNS_META = JSON.parse(fs.readFileSync(path.join(SRC, 'signs', 'signs.json'), 'utf8'));

const CAT_META = {
  warning: { prefix: /^1\./, section: 'Предупреждающие знаки' },
  priority: { prefix: /^2\./, section: 'Знаки приоритета' },
  prohibition: { prefix: /^3\./, section: 'Запрещающие знаки' },
  mandatory: { prefix: /^4\./, section: 'Предписывающие знаки' },
  special: { prefix: /^5\./, section: 'Знаки особых предписаний' },
  info: { prefix: /^6\./, section: 'Информационные знаки' },
  service: { prefix: /^7\./, section: 'Знаки сервиса' },
  additional: { prefix: /^8\./, section: 'Знаки дополнительной информации (таблички)' },
};

const QUESTIONS_PER_CAT = 20;

function adaptPmr(text) {
  if (!text) return '';
  let t = text
    .replace(/КоАП РФ[^.]*\.(\s|$)/gi, '')
    .replace(/Наказание за нарушение[^.]*\.(\s|$)/gi, '')
    .replace(/штраф[^.]*руб\.?/gi, '')
    .replace(/лишение права управления[^.]*\.?/gi, '')
    .replace(/инспектор(ов|а)?\s+ГИБДД/gi, 'инспекторов ГАИ ПМР')
    .replace(/ГИБДД/g, 'ГАИ ПМР')
    .replace(/Почта России/g, 'почтовая служба')
    .replace(/\(«Дорожные знаки»\)/g, '(ПДД ПМР, дорожные знаки)')
    .replace(/\(«Дорожные знаки»,/g, '(ПДД ПМР, дорожные знаки,')
    .replace(/\(Пункт/g, '(ПДД ПМР, пункт')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const clean = t.split('.').slice(0, 3).join('.').trim();
  const base = clean.length > 30 ? clean : t.slice(0, 400);
  if (!base.includes('ПДД ПМР')) return base + ' (ПДД ПМР)';
  return base;
}

function extractSignNumbers(text) {
  const nums = new Set();
  const re = /(?:знак[аи]?|таб\.?|табличк[аи]?)\s*([1-8]\.\d+(?:\.\d+)?)/gi;
  let m;
  while ((m = re.exec(text))) nums.add(m[1]);
  const re2 = /\b([1-8]\.\d+(?:\.\d+)?)\b/g;
  while ((m = re2.exec(text))) nums.add(m[1]);
  return [...nums];
}

function primarySignForCategory(text, catId) {
  const prefix = CAT_META[catId]?.prefix;
  if (!prefix) return null;
  return extractSignNumbers(text).find(n => prefix.test(n)) || null;
}

function imagePath(raw) {
  if (!raw) return '';
  return `images/A_B/${path.basename(raw)}`;
}

function signSvg(signNum) {
  for (const group of Object.values(SIGNS_META)) {
    if (group[signNum]?.image) {
      return group[signNum].image.replace('./images/signs/', 'images/signs/');
    }
  }
  return '';
}

function getSignsInSection(section) {
  const group = SIGNS_META[section] || {};
  return Object.values(group).map(s => ({
    number: s.number,
    title: s.title,
    image: signSvg(s.number),
    description: s.description || '',
  }));
}

function convertQuestion(q, catId, idx) {
  const tip = q.answer_tip || '';
  const sign = primarySignForCategory(tip + ' ' + q.question, catId);
  const answers = q.answers.map(a => a.answer_text);
  const correct = q.answers.findIndex(a => a.is_correct);
  return {
    id: idx + 1,
    sign: sign || '',
    text: q.question.trim(),
    image: q.image ? imagePath(q.image) : signSvg(sign),
    answers,
    correct: correct >= 0 ? correct : 0,
    explanation: adaptPmr(tip),
  };
}

function filterSignQuestions(all, catId) {
  const prefix = CAT_META[catId].prefix;
  return all.filter(q => {
    const blob = (q.answer_tip || '') + ' ' + q.question;
    return extractSignNumbers(blob).some(s => prefix.test(s)) && primarySignForCategory(blob, catId);
  });
}

function theoryQuestion(sign, allTitles, idx) {
  const wrong = allTitles.filter(t => t !== sign.title).sort(() => Math.random() - 0.5).slice(0, 3);
  const answers = [sign.title, ...wrong].sort(() => Math.random() - 0.5);
  const correct = answers.indexOf(sign.title);
  const desc = sign.description.split(/[.!]/).find(s => s.length > 20) || sign.description.slice(0, 200);
  return {
    id: idx + 1,
    sign: sign.number,
    text: `Как называется дорожный знак ${sign.number}?`,
    image: sign.image,
    answers,
    correct,
    explanation: adaptPmr(`Знак ${sign.number} «${sign.title}». ${desc}.`),
  };
}

function theoryQuestionMeaning(sign, idx) {
  const sentences = sign.description.split(/(?<=[.!])\s+/).filter(s => s.length > 15);
  const main = sentences[0] || `Знак ${sign.number} «${sign.title}»`;
  const fake = [
    'Запрещает движение всех транспортных средств',
    'Указывает расстояние до населённого пункта',
    'Обозначает конец всех ограничений',
    'Разрешает обгон на перекрёстке',
    'Требует включения аварийной сигнализации',
  ].filter(f => !main.toLowerCase().includes(f.slice(0, 15).toLowerCase())).slice(0, 3);
  const shortMain = main.length > 120 ? main.slice(0, 117) + '…' : main;
  const answers = [shortMain, ...fake].sort(() => Math.random() - 0.5);
  return {
    id: idx + 1,
    sign: sign.number,
    text: `Что информирует знак ${sign.number} «${sign.title}»?`,
    image: sign.image,
    answers,
    correct: answers.indexOf(shortMain),
    explanation: adaptPmr(`${main} (ПДД ПМР, знак ${sign.number})`),
  };
}

const allSignQ = JSON.parse(fs.readFileSync(SIGNS_PATH, 'utf8'));
const allMarkQ = JSON.parse(fs.readFileSync(MARKING_PATH, 'utf8'));
const usedIds = new Set();

function buildCategory(catId, count, skipIds = new Set()) {
  const meta = CAT_META[catId];
  const sectionSigns = getSignsInSection(meta.section);
  const allTitles = sectionSigns.map(s => s.title);
  const filtered = filterSignQuestions(allSignQ, catId).filter(q => !usedIds.has(q.id) && !skipIds.has(q.id));
  const situational = filtered.filter(q => q.image?.includes('A_B'));
  const theoretical = filtered.filter(q => !q.image?.includes('A_B'));
  const picked = [];
  for (const q of [...situational, ...theoretical]) {
    if (picked.length >= count) break;
    picked.push(q);
    usedIds.add(q.id);
  }

  const usedSigns = new Set();
  let signIdx = 0;
  let alt = 0;
  while (picked.length < count && sectionSigns.length > 0) {
    const sign = sectionSigns[signIdx % sectionSigns.length];
    signIdx++;
    const gen = alt % 2 === 0
      ? theoryQuestion(sign, allTitles, picked.length)
      : theoryQuestionMeaning(sign, picked.length);
    alt++;
    picked.push({ _generated: true, ...gen });
  }

  return picked.map((q, i) => (q._generated ? { ...q, id: i + 1, _generated: undefined } : convertQuestion(q, catId, i)));
}

function pickMarking(count) {
  const withImg = allMarkQ.filter(q => q.image && !q.image.includes('no_image'));
  const picked = withImg.slice(0, count);
  return picked.map((q, i) => {
    const correct = q.answers.findIndex(a => a.is_correct);
    return {
      id: i + 1,
      sign: extractSignNumbers(q.answer_tip || '')[0] || '',
      text: q.question.trim(),
      image: imagePath(q.image),
      answers: q.answers.map(a => a.answer_text),
      correct: correct >= 0 ? correct : 0,
      explanation: adaptPmr(q.answer_tip),
    };
  });
}

for (const cat of EXISTING.categories) {
  if (cat.id === 'warning') continue;
  if (cat.id === 'marking') {
    cat.questions = pickMarking(QUESTIONS_PER_CAT);
    continue;
  }
  if (CAT_META[cat.id]) {
    cat.questions = buildCategory(cat.id, QUESTIONS_PER_CAT);
  }
}

fs.writeFileSync(OUT, JSON.stringify(EXISTING, null, 2), 'utf8');
EXISTING.categories.forEach(c => console.log(`${c.title}: ${c.questions.length}`));
