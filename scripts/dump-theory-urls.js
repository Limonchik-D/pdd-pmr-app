const https = require('https');
const fs = require('fs');
const url = 'https://pdd-expert.com/правила-дорожного-движения-пмр/';

https.get(url, { headers: { 'User-Agent': 'PDD-PMR/1' } }, res => {
  let d = '';
  res.on('data', c => (d += c));
  res.on('end', () => {
    const re = /href="([^"]+)"/gi;
    const links = new Set();
    let m;
    while ((m = re.exec(d))) {
      let h = m[1];
      if (h.startsWith('/')) h = 'https://pdd-expert.com' + h;
      h = decodeURIComponent(h).replace(/\/$/, '');
      if (!h.includes('правила-дорожного-движения-пмр')) continue;
      if (h.endsWith('правила-дорожного-движения-пмр')) continue;
      if (h.includes('#')) continue;
      links.add(h);
    }
    const prefix = 'https://pdd-expert.com/правила-дорожного-движения-пмр/';
    const out = [...links].map(full => ({
      full,
      slug: full.replace(prefix, ''),
    })).sort((a, b) => a.slug.localeCompare(b.slug));
    out.forEach(x => console.log(x.slug));
    console.log('count', out.length);
    fs.writeFileSync('c:/Код/vs cod/pdd-pmr-app/scripts/theory-urls.json', JSON.stringify(out, null, 2));
  });
});
