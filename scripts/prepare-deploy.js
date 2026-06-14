/** Подготовка папки dist/ для деплоя на Cloudflare Pages */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist');

const COPY = ['index.html', 'manifest.webmanifest', 'sw.js', 'js', 'data', 'images'];

function copyRecursive(src, dest) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      if (name === 'pdd_russia-master' || name === 'node_modules') continue;
      copyRecursive(path.join(src, name), path.join(dest, name));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

if (fs.existsSync(OUT)) fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT);

for (const item of COPY) {
  const src = path.join(ROOT, item);
  if (!fs.existsSync(src)) {
    console.warn('⚠ Пропуск (нет файла):', item);
    continue;
  }
  copyRecursive(src, path.join(OUT, item));
  console.log('✓', item);
}

const ignore = `pdd_russia-master/
scripts/
node_modules/
.git/
dist/
*.md
`;
fs.writeFileSync(path.join(OUT, '.assetsignore'), ignore, 'utf8');
console.log('\nГотово: dist/ — загрузите на Cloudflare Pages');
