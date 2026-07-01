/**
 * Удаляет хвостовое «ПДД ПМР оглавление:» и всё после него из глав теории.
 * Исправляет типичные битые символы (U+FFFD) в текстах.
 */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'data', 'theory', 'chapters');

const ENCODING_FIXES = [
  [/вла\uFFFD\uFFFDельца/g, 'владельца'],
  [/разм\uFFFD\uFFFDтка/g, 'разметка'],
  [/Пешех\uFFFD\uFFFDд/gi, 'Пешеход'],
  [/пешех\uFFFD\uFFFDд/gi, 'пешеход'],
  [/встречн\uFFFD\uFFFDй/g, 'встречный'],
  [/массой \uFFFD\uFFFDо/g, 'массой по'],
  [/эстакад\uFFFD\uFFFDх/g, 'эстакадах'],
  [/Рас\uFFFD\uFFFDоложение/g, 'Расположение'],
  [/рас\uFFFD\uFFFDоложение/g, 'расположение'],
  [/Ука\uFFFD\uFFFDывает/g, 'Указывает'],
  [/Приложен\uFFFD\uFFFDе/g, 'Приложение'],
  [/приложен\uFFFD\uFFFDе/g, 'приложение'],
  [/наноси\uFFFD\uFFFDся/g, 'наносится'],
  [/движ\uFFFD\uFFFDние/g, 'движение'],
  [/серв\uFFFD\uFFFDса/g, 'сервиса'],
  [/сервиса \uFFFD\uFFFDнформируют/g, 'сервиса информируют'],
  [/сервиса \uFFFD\uFFFD/g, 'сервиса '],
  [/н\uFFFD\uFFFDплавные/g, 'неплавные'],
  [/грузы к/g, 'грузы к'],
  [/\uFFFD\uFFFDрузы/g, 'грузы'],
  [/прав\uFFFD\uFFFDму/g, 'правому'],
  [/органи\uFFFD\uFFFDованных/g, 'организованных'],
  [/21 \uFFFD\uFFFDравил/g, '21 Правил'],
  [/з\uFFFD\uFFFDаком/g, 'знаком'],
  [/прого\uFFFD\uFFFD/g, 'прогон'],
  [/ин\uFFFD\uFFFDх/g, 'иных'],
  [/водит\uFFFD\uFFFDльское/g, 'водительское'],
  [/мопе\uFFFD\uFFFDов/g, 'мопедов'],
  [/п\uFFFD\uFFFDнктах/g, 'пунктах'],
  [/велосипедн\uFFFD\uFFFDя/g, 'велосипедная'],
  [/включенным\uFFFD\uFFFD /g, 'включенным '],
  [/тран\uFFFD\uFFFDпортных/g, 'транспортных'],
  [/тр\uFFFD\uFFFDнспортным/g, 'транспортным'],
  [/об\uFFFD\uFFFDона/g, 'обгона'],
  [/от\uFFFD\uFFFDосится/g, 'относится'],
  [/мопедах н\uFFFD\uFFFDт/g, 'мопедах нет'],
  [/приведен\uFFFD\uFFFDя/g, 'приведения'],
  [/ни\uFFFD\uFFFDе/g, 'ниже'],
  [/\uFFFD\uFFFDредназначен/g, 'предназначен'],
  [/на вс\uFFFD\uFFFD /g, 'на все '],
  [/за\uFFFD\uFFFDрещено/g, 'запрещено'],
  [/ко\uFFFD\uFFFDда/g, 'когда'],
  [/доро\uFFFD\uFFFDных/g, 'дорожных'],
  [/перех\uFFFD\uFFFDды/g, 'переходы'],
  [/пр\uFFFD\uFFFDблесковый/g, 'проблесковый'],
  [/та\uFFFD\uFFFDих/g, 'таких'],
  [/&#8211;/g, '–'],
  [/&#8220;/g, '«'],
  [/&#8221;/g, '»'],
];

function fixText(s) {
  if (!s) return s;
  let t = s;
  for (const [re, rep] of ENCODING_FIXES) t = t.replace(re, rep);
  return t.replace(/\uFFFD+/g, '');
}

let tocRemoved = 0;
let fixedChars = 0;

for (const file of fs.readdirSync(DIR).filter(f => f.endsWith('.json'))) {
  const fp = path.join(DIR, file);
  const raw = fs.readFileSync(fp, 'utf8');
  const data = JSON.parse(raw);
  const before = data.blocks.length;
  const tocIdx = data.blocks.findIndex(b => /^ПДД ПМР оглавление:?$/i.test((b.text || '').trim()));
  if (tocIdx >= 0) {
    data.blocks = data.blocks.slice(0, tocIdx);
    tocRemoved += before - data.blocks.length;
  }
  data.blocks = data.blocks.map(b => {
    const t = fixText(b.text || '');
    if (t !== b.text) fixedChars++;
    return { ...b, text: t };
  });
  if (data.title) data.title = fixText(data.title);
  fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf8');
}

console.log(`Удалено блоков оглавления: ${tocRemoved}`);
console.log(`Исправлено текстовых блоков: ${fixedChars}`);
