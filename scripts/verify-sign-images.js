const fs = require('fs');
const path = require('path');
const { shouldKeepSignImage } = require('./extract-sign-numbers');

let bad = 0;
function scan(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) scan(p);
    else if (f.endsWith('.json')) {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      for (const q of data.questions || []) {
        if (q.image?.includes('images/signs/') && !shouldKeepSignImage(q)) bad++;
      }
    }
  }
}
scan(path.join(__dirname, '..', 'data', 'tests'));
scan(path.join(__dirname, '..', 'data', 'tickets'));
console.log(bad === 0 ? 'OK: no wrong sign images' : `FAIL: ${bad} wrong sign images`);
