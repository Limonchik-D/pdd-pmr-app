const https = require('https');
const fs = require('fs');
const path = require('path');
const { theoryChapters } = require('./categories-config');

const url = 'https://pdd-expert.com/правила-дорожного-движения-пмр/';
const BASE = 'https://pdd-expert.com/правила-дорожного-движения-пмр/';

https.get(url, { headers: { 'User-Agent': 'PDD-PMR/1' } }, res => {
  let d = '';
  res.on('data', c => (d += c));
  res.on('end', () => {
    const re = /href="(https:\/\/pdd-expert\.com\/[^"]+|\/[^"]+)"/gi;
    const links = new Set();
    let m;
    while ((m = re.exec(d))) {
      let h = m[1];
      if (h.startsWith('/')) h = 'https://pdd-expert.com' + h;
      if (h.includes('правила-дорожного-движения-пмр') && h !== BASE && !h.includes('#'))
        links.add(h.replace(/\/$/, ''));
    }
    const list = [...links].sort();
    const slugMap = {};
    for (const full of list) {
      const slug = full.replace(BASE.replace(/\/$/, ''), '').replace(/^\//, '');
      slugMap[slug] = full;
    }

    console.log('Discovered slugs:\n');
    for (const ch of theoryChapters) {
      const candidates = list.filter(l =>
        l.toLowerCase().includes(ch.id.replace(/-/g, '').slice(0, 8)) ||
        slugMap[ch.slug]
      );
      const exact = slugMap[ch.slug] ? ch.slug : null;
      console.log(ch.id, '->', exact || '(need manual)', ch.slug);
    }

    fs.writeFileSync(path.join(__dirname, 'theory-slugs.json'), JSON.stringify({ links: list, slugMap }, null, 2));
    console.log('\nSaved theory-slugs.json');
  });
});
