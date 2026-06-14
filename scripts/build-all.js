/**
 * Сборка data/manifest.json + data/tests/*.json
 * Источник вопросов: pdd_russia-master (картинки + структура)
 * Тексты адаптируются под ПДД ПМР
 */
const fs = require('fs');
const path = require('path');
const { groups, categories } = require('./categories-config');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'pdd_russia-master', 'pdd_russia-master');
const TOPICS = path.join(SRC, 'questions', 'A_B', 'topics');
const SIGNS_Q = path.join(TOPICS, 'Дорожные знаки.json');
const SIGNS_META = JSON.parse(fs.readFileSync(path.join(SRC, 'signs', 'signs.json'), 'utf8'));

const OUT_TESTS = path.join(ROOT, 'data', 'tests');
const OUT_MANIFEST = path.join(ROOT, 'data', 'manifest.json');
const MAX_QUESTIONS_PER_TEST = 30;

const cache = {};
function loadTopic(file) {
  if (!file) return [];
  if (!cache[file]) {
    const p = path.join(TOPICS, file);
    cache[file] = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : [];
  }
  return cache[file];
}

const allSignQuestions = JSON.parse(fs.readFileSync(SIGNS_Q, 'utf8'));

function adaptPmr(text) {
  if (!text) return 'Согласно ПДД ПМР (Постановление Правительства ПМР № 126 от 02.06.2017).';
  let t = text
    .replace(/КоАП РФ[^.]*\.(\s|$)/gi, '')
    .replace(/Наказание за нарушение[^.]*\.(\s|$)/gi, '')
    .replace(/штраф[^.]*руб\.?/gi, '')
    .replace(/лишение права управления[^.]*\.?/gi, '')
    .replace(/инспектор(ов|а)?\s+ГИБДД/gi, 'инспекторов ГАИ ПМР')
    .replace(/ГИБДД/g, 'ГАИ ПМР')
    .replace(/Почта России/g, 'почтовая служба')
    .replace(/ПДД РФ/g, 'ПДД ПМР')
    .replace(/\(«Дорожные знаки»\)/g, '(ПДД ПМР, дорожные знаки)')
    .replace(/\(«Дорожные знаки»,/g, '(ПДД ПМР, дорожные знаки,')
    .replace(/\(Пункт/g, '(ПДД ПМР, пункт')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!/ПДД ПМР/i.test(t)) t += ' (ПДД ПМР, Постановление № 126 от 02.06.2017).';
  return t;
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

function imagePath(raw) {
  if (!raw || raw.includes('no_image')) return '';
  const name = path.basename(raw);
  if (name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png')) {
    return `images/A_B/${name}`;
  }
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

function convertQuestion(q, signHint, idx) {
  const tip = q.answer_tip || '';
  const sign = signHint || extractSignNumbers(tip + ' ' + q.question)[0] || '';
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
  };
}

function filterSignQuestions(prefix) {
  return allSignQuestions.filter(q => {
    const blob = (q.answer_tip || '') + ' ' + q.question;
    return extractSignNumbers(blob).some(s => prefix.test(s));
  });
}

function pickQuestions(cat) {
  let pool = [];
  if (cat.signPrefix) {
    pool = filterSignQuestions(cat.signPrefix);
  } else {
    pool = loadTopic(cat.source);
    if (cat.filter) {
      pool = pool.filter(q => cat.filter((q.answer_tip || '') + ' ' + q.question));
    }
  }
  pool = pool.filter(q => !q.image?.includes('no_image') || !cat.requireImage);
  if (pool.length === 0 && cat.filter && cat.source) {
    pool = loadTopic(cat.source).filter(q => !q.image?.includes('no_image'));
  }
  if (pool.length === 0 && cat.source) {
    pool = loadTopic(cat.source);
  }
  const situational = pool.filter(q => q.image?.includes('A_B'));
  const rest = pool.filter(q => !q.image?.includes('A_B'));
  const ordered = [...situational, ...rest];
  return ordered.map((q, i) => {
    const sign = cat.signPrefix
      ? extractSignNumbers((q.answer_tip || '') + q.question).find(s => cat.signPrefix.test(s))
      : extractSignNumbers((q.answer_tip || '') + q.question)[0];
    return convertQuestion(q, sign, i);
  });
}

if (!fs.existsSync(OUT_TESTS)) fs.mkdirSync(OUT_TESTS, { recursive: true });

const manifestCategories = [];
let totalQuestions = 0;

for (const cat of categories) {
  const allQuestions = pickQuestions(cat);
  const chunks = [];
  for (let i = 0; i < allQuestions.length; i += MAX_QUESTIONS_PER_TEST) {
    chunks.push(allQuestions.slice(i, i + MAX_QUESTIONS_PER_TEST));
  }
  if (!chunks.length) chunks.push([]);

  chunks.forEach((questions, partIdx) => {
    const multi = chunks.length > 1;
    const id = multi ? `${cat.id}-p${partIdx + 1}` : cat.id;
    const title = multi ? `${cat.title} (ч.${partIdx + 1})` : cat.title;
    totalQuestions += questions.length;
    const out = { id, title, baseId: cat.id, part: multi ? partIdx + 1 : null, parts: multi ? chunks.length : null, questions };
    fs.writeFileSync(path.join(OUT_TESTS, `${id}.json`), JSON.stringify(out, null, 2), 'utf8');
    manifestCategories.push({
      id,
      baseId: cat.id,
      group: cat.group,
      icon: cat.icon,
      title,
      desc: cat.desc,
      questionCount: questions.length,
      part: multi ? partIdx + 1 : null,
      parts: multi ? chunks.length : null,
      dataFile: `tests/${id}.json`,
    });
    console.log(`${String(questions.length).padStart(3)}  ${title}`);
  });
}

const manifest = {
  version: 1,
  source: 'ПДД ПМР (Постановление № 126), адаптация по pdd-expert.com',
  groups,
  categories: manifestCategories,
  stats: { topics: manifestCategories.length, questions: totalQuestions },
};

fs.writeFileSync(OUT_MANIFEST, JSON.stringify(manifest, null, 2), 'utf8');
console.log(`\nВсего: ${manifestCategories.length} тем, ${totalQuestions} вопросов`);
