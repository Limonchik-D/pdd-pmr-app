/** Извлечение номеров дорожных знаков — только при явном упоминании «знак» / «табличка». */
function extractSignNumbers(text) {
  if (!text) return [];
  const nums = new Set();
  const re = /(?:знак(?:а|ами|ом|ов|е)?|таб\.?|табличк(?:а|и|ой|ами)?)\s*([1-8]\.\d+(?:\.\d+)?(?:\s*[,–—-]\s*[1-8]\.\d+(?:\.\d+)?)*)/gi;
  let m;
  while ((m = re.exec(text))) {
    m[1].split(/\s*[,–—-]\s*/).forEach(n => {
      const t = n.trim();
      if (t) nums.add(t);
    });
  }
  return [...nums];
}

/** Нужно ли показывать SVG-знак в вопросе теста */
function shouldKeepSignImage(q) {
  if (!q.image) return false;
  if (q.image.includes('images/A_B/')) return true;
  if (!q.image.includes('images/signs/')) return true;
  return /(?:знак|табличк|таб\.|разметк|данн(?:ый|ого|ые|ых)\s+знак|эти\s+знак|как(?:ой|ие)\s+знак)/i.test(q.text || '');
}

module.exports = { extractSignNumbers, shouldKeepSignImage };
