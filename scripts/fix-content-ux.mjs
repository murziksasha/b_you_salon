import { readFileSync, writeFileSync } from 'fs';

const p = 'data/site.json';
const data = JSON.parse(readFileSync(p, 'utf8'));

function fixStr(s) {
  if (typeof s !== 'string') return s;
  return s
    .replace(/ПН - ПТ с /g, 'ПН - ПТ з ')
    .replace(/\+38\(\s*___\s*\)\s*__\s*__\s*___/g, '+38 (___) ___ __ __')
    .replace(/Відремонтуємо побутову техніку\.\s*та цифрову техніку/g, 'Відремонтуємо побутову та цифрову техніку')
    .replace(/Кофемашина/g, 'Кавомашина')
    .replace(/кофемашина/g, 'кавомашина');
}

data.settings.officeHours = fixStr(data.settings.officeHours);
data.settings.description = fixStr(data.settings.description);

for (const soc of data.settings.social || []) {
  if (soc.url && soc.url.startsWith('http://')) {
    soc.url = soc.url.replace('http://', 'https://');
  }
}

for (const g of data.goods || []) {
  const t = (g.title || '').toLowerCase();
  const d = (g.description || '').toLowerCase();
  if (
    t === 'test' ||
    t.includes('new test') ||
    d.includes('super goods') ||
    d.includes('the best goods')
  ) {
    g.visible = false;
  }
}

for (const page of data.pages || []) {
  page.description = fixStr(page.description);
  page.title = fixStr(page.title);
  for (const sec of page.sections || []) {
    for (const key of Object.keys(sec)) {
      if (typeof sec[key] === 'string') sec[key] = fixStr(sec[key]);
    }
    if (Array.isArray(sec.aboutLines)) {
      sec.aboutLines = sec.aboutLines.map(fixStr);
    }
    if (Array.isArray(sec.items)) {
      sec.items = sec.items.map((item) => {
        if (typeof item === 'string') return fixStr(item);
        if (item && typeof item === 'object') {
          for (const k of Object.keys(item)) {
            if (typeof item[k] === 'string') item[k] = fixStr(item[k]);
          }
        }
        return item;
      });
    }
    if (sec.callbackPlaceholder) sec.callbackPlaceholder = '+38 (___) ___ __ __';
    if (typeof sec.placeholder === 'string' && sec.placeholder.includes('___')) {
      sec.placeholder = '+38 (___) ___ __ __';
    }
  }
}

if (!data.updatedAt) data.updatedAt = new Date().toISOString();

writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
console.log('ok officeHours=', data.settings.officeHours);
console.log(
  'visible goods',
  data.goods.filter((g) => g.visible).length,
  '/',
  data.goods.length,
);
