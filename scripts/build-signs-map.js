/** data/signs-map.json — номер знака → путь к SVG */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'pdd_russia-master', 'pdd_russia-master', 'signs', 'signs.json');
const OUT = path.join(__dirname, '..', 'data', 'signs-map.json');

const meta = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const map = {};
for (const group of Object.values(meta)) {
  for (const [num, data] of Object.entries(group)) {
    if (data?.image) {
      map[num] = data.image.replace('./images/signs/', 'images/signs/');
    }
  }
}
fs.writeFileSync(OUT, JSON.stringify(map, null, 2), 'utf8');
console.log(`signs-map: ${Object.keys(map).length} знаков`);
