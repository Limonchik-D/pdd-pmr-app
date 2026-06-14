/**
 * Сборка data/theory/toc.json + data/theory/chapters/*.json
 * Контент с pdd-expert.com (ПДД ПМР)
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { theoryChapters } = require('./categories-config');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'data', 'theory', 'chapters');
const OUT_TOC = path.join(ROOT, 'data', 'theory', 'toc.json');
const INDEX_URL = 'https://pdd-expert.com/правила-дорожного-движения-пмр/';
const BASE = 'https://pdd-expert.com/правила-дорожного-движения-пмр/';

/** Точные slug-пути с pdd-expert (WordPress обрезает длинные URL) */
const SLUG_OVERRIDES = {
  'general-provisions': 'пдд-пмр-общие-положения',
  'driver-duties': 'общие-обязанности-водителей',
  'special-signals': 'пдд-пмр-применение-специальных-сигна',
  'pedestrian-duties': 'пдд-пмр-обязанности-пешеходов',
  'passenger-duties': 'пдд-пмр-обязанности-пассажиров',
  'traffic-signals': 'пдд-пмр-сигналы-светофора-и-регулиров',
  'emergency-signals': 'пдд-пмр-применение-аварийной-сигнали',
  'maneuvering': 'пдд-пмр-начало-движения-маневрирован',
  'lane-position': 'пдд-пмр-расположение-транспортных-ср',
  'speed': 'пдд-пмр-скорость-движения',
  'overtaking': 'пдд-пмр-обгон-встречный-разъезд',
  'parking': 'пдд-пмр-остановка-и-стоянка',
  'intersections': 'пдд-пмр-проезд-перекрестков',
  'crosswalks': 'пдд-пмр-пешеходные-переходы-и-места-ос',
  'railway': 'пдд-пмр-движение-через-железнодорожн',
  'highways': 'пдд-пмр-движение-по-автомагистралям-и',
  'residential': 'пдд-пмр-движение-в-жилой-и-пешеходной-з',
  'route-priority': 'пдд-пмр-приоритет-маршрутных-транспо',
  'lights-horn': 'пдд-пмр-пользования-внешними-световы',
  'towing': 'пдд-пмр-буксировка-механических-тран',
  'training': 'пдд-пмр-учебная-езда',
  'cargo-people': 'пдд-пмр-перевозка-людей',
  'cargo-goods': 'пдд-пмр-перевозка-грузов',
  'cyclists': 'пдд-пмр-дополнительные-требования-к-д',
  'horse-vehicles': 'пдд-пмр-дополнительные-требования-к-д-2',
  'appendix1': 'пдд-пмр-приложение-1-перечень-неисправ',
  'appendix2': 'основные-положения-по-допуску-тс-к-экс',
  'signs-intro': 'пдд-пмр-дорожные-знаки',
  'signs-warning': 'пдд-пмр-дорожные-знаки/пдд-пмр-предупреждающие-знаки',
  'signs-priority': 'пдд-пмр-дорожные-знаки/пдд-пмр-знаки-приоритета',
  'signs-prohibition': 'пдд-пмр-дорожные-знаки/пдд-пмр-запрещающие-знаки',
  'signs-mandatory': 'пдд-пмр-дорожные-знаки/пдд-пмр-предписывающие-знаки',
  'signs-special': 'пдд-пмр-дорожные-знаки/пдд-пмр-знаки-особых-предписаний',
  'signs-info': 'пдд-пмр-дорожные-знаки/пдд-пмр-информационные-знаки',
  'signs-service': 'пдд-пмр-дорожные-знаки/пдд-пмр-знаки-сервиса',
  'signs-additional': 'пдд-пмр-дорожные-знаки/пдд-пмр-знаки-дополнительной-информа',
  'marking-intro': 'горизонтальная-разметка',
  'marking-horizontal': 'горизонтальная-разметка',
  'marking-vertical': 'вертикальная-разметка',
};

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'PDD-PMR-App/1.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const loc = res.headers.location.startsWith('http')
          ? res.headers.location
          : `https://pdd-expert.com${res.headers.location}`;
        return fetch(loc).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject);
  });
}

function normalize(s) {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

function extractIndexLinks(html) {
  const links = [];
  const re = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    let href = m[1];
    const text = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text || text.length < 4) continue;
    if (href.startsWith('/')) href = 'https://pdd-expert.com' + href;
    if (!href.includes('правила-дорожного-движения-пмр')) continue;
    if (href.endsWith('правила-дорожного-движения-пмр/')) continue;
    if (href.includes('#')) continue;
    links.push({ href: href.replace(/\/$/, ''), text: normalize(text) });
  }
  return links;
}

function resolveChapterUrl(ch, indexLinks) {
  if (SLUG_OVERRIDES[ch.id]) return BASE + SLUG_OVERRIDES[ch.id] + '/';
  const slugUrl = BASE + ch.slug + '/';
  const titleNorm = normalize(ch.title);
  const titleWords = titleNorm.split(' ').filter(w => w.length > 3);

  let best = null;
  let bestScore = 0;
  for (const link of indexLinks) {
    let score = 0;
    for (const w of titleWords) if (link.text.includes(w)) score++;
    if (link.href.includes(ch.slug)) score += 3;
    if (score > bestScore) { bestScore = score; best = link.href; }
  }
  if (bestScore >= 2 && best) return best + '/';
  return slugUrl;
}

function htmlToBlocks(html) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '');

  const article = text.match(/<article[\s\S]*?<\/article>/i)?.[0]
    || text.match(/<main[\s\S]*?<\/main>/i)?.[0]
    || text.match(/<div class="entry-content"[\s\S]*?<\/div>/i)?.[0]
    || text;

  const blocks = [];
  const parts = article.split(/<\/?(?:h1|h2|h3|p|li|br\s*\/?)(?:\s[^>]*)?>/gi);
  for (let part of parts) {
    let t = part.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    if (t.length < 4) continue;
    if (/^Понравился сайт/i.test(t)) continue;
    if (/^Поделиться/i.test(t)) continue;
    if (/^Оплата/i.test(t)) continue;
    if (/РЕШАТЬ БИЛЕТЫ|ЭКЗАМЕН ПДД/i.test(t)) continue;
    if (/^Правила Дорожного Движения ПМР\.?$/i.test(t)) continue;
    const isHeading = /^\d+\.\s/.test(t) || (t.length < 120 && /^[А-ЯA-Z«]/.test(t) && !/;\s/.test(t));
    blocks.push({ type: isHeading && t.length < 120 ? 'heading' : 'paragraph', text: t.replace(/^#+\s*/, '') });
  }
  return blocks.slice(0, 250);
}

async function buildChapter(ch, indexLinks) {
  const url = resolveChapterUrl(ch, indexLinks);
  try {
    const { status, body } = await fetch(url);
    if (status !== 200) throw new Error(`HTTP ${status}`);
    const blocks = htmlToBlocks(body);
    if (blocks.length < 3) throw new Error('too few blocks');
    return {
      id: ch.id,
      title: ch.title,
      section: ch.section,
      parent: ch.parent || null,
      source: url,
      blocks,
    };
  } catch (e) {
    console.warn(`  ⚠ ${ch.title}: ${e.message} (${url})`);
    return {
      id: ch.id,
      title: ch.title,
      section: ch.section,
      parent: ch.parent || null,
      source: url,
      blocks: [
        { type: 'heading', text: ch.title },
        { type: 'paragraph', text: `Раздел «${ch.title}» Правил дорожного движения ПМР. Полный текст — в официальном документе Постановления Правительства ПМР № 126 от 02.06.2017.` },
      ],
    };
  }
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log('Загрузка оглавления pdd-expert...');
  const { body: indexHtml } = await fetch(INDEX_URL);
  const indexLinks = extractIndexLinks(indexHtml);
  console.log(`  Найдено ссылок: ${indexLinks.length}`);

  const toc = {
    title: 'Правила дорожного движения ПМР',
    subtitle: 'Постановление Правительства ПМР № 126 от 02.06.2017 (ред. 2026)',
    chapters: theoryChapters.map(c => ({
      id: c.id,
      title: c.title,
      section: c.section,
      parent: c.parent || null,
      file: `chapters/${c.id}.json`,
    })),
  };
  fs.writeFileSync(OUT_TOC, JSON.stringify(toc, null, 2), 'utf8');

  console.log(`Загрузка ${theoryChapters.length} глав теории...`);
  for (const ch of theoryChapters) {
    process.stdout.write(`  ${ch.title}... `);
    const data = await buildChapter(ch, indexLinks);
    fs.writeFileSync(path.join(OUT_DIR, `${ch.id}.json`), JSON.stringify(data, null, 2), 'utf8');
    console.log(`${data.blocks.length} блоков`);
    await new Promise(r => setTimeout(r, 350));
  }
  console.log('Готово:', OUT_TOC);
}

main().catch(console.error);
