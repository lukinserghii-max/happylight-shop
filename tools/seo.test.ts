/**
 * Перевірки SEO-сторінок: розмітка schema.org парситься, ціни на місці, посилання не биті,
 * текст без «undefined/NaN», шкідливі назви екрануються, приховані товари не публікуються.
 *   npm run test:seo
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname, normalize as normPath } from 'node:path';
import { normalize, type Catalog } from '../lib/catalog';
import { renderProduct, renderSitemap, renderLlms, retroTable, pretty, visible, type Ctx } from '../lib/seo';

const PUB = 'public';
let fails = 0;
const ok = (cond: boolean, msg: string) => { if (!cond) { fails++; console.error('FAIL', msg); } };

const files: string[] = [];
const walk = (d: string) => { for (const e of readdirSync(join(PUB, d), { withFileTypes: true })) { const r = join(d, e.name); e.isDirectory() ? walk(r) : files.push(r); } };
for (const d of ['katalog', 'tovar', 'yak-obraty']) walk(d);
files.push('index.html');

const catalog = normalize(JSON.parse(readFileSync(join(PUB, 'data/catalog.json'), 'utf8')) as Partial<Catalog>);
ok(files.filter(f => f.startsWith('tovar')).length === visible(catalog).length, 'кількість сторінок товарів = видимі товари');

let products = 0, links = 0;
for (const f of files) {
  const html = readFileSync(join(PUB, f), 'utf8');
  ok(!/\bundefined\b|\bNaN\b|>null</.test(html), `${f}: undefined/NaN у тексті`);
  ok(/<h1[\s>]/.test(html), `${f}: немає h1`);
  ok(f === 'index.html' || /<link rel="canonical" href="https:\/\//.test(html), `${f}: немає canonical`);
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let data: { '@graph'?: Array<Record<string, unknown>> } = {};
    try { data = JSON.parse(m[1]); } catch { ok(false, `${f}: JSON-LD не парситься`); continue; }
    for (const node of data['@graph'] ?? []) {
      if (node['@type'] !== 'Product') continue;
      products++;
      const o = node.offers as Record<string, unknown> | undefined;
      ok(!!o && (typeof o.price === 'number' || (typeof o.lowPrice === 'number' && typeof o.highPrice === 'number')), `${f}: Product без ціни`);
      ok(!!o && o.priceCurrency === 'UAH', `${f}: валюта`);
      ok(typeof node.image === 'string' && (node.image as string).startsWith('https://'), `${f}: image не абсолютний`);
    }
  }
  // відносні посилання ведуть на існуючі файли (якорі й зовнішні пропускаємо)
  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const u = m[1].replace(/&amp;/g, '&');
    if (/^(https?:|tel:|mailto:|data:|#)/.test(u)) continue;
    const path = u.split('#')[0].split('?')[0];
    if (!path) continue;
    const target = normPath(join(PUB, dirname(f), path));
    const exists = existsSync(target) && (!target.endsWith('/') || existsSync(join(target, 'index.html')));
    const isDirOk = path.endsWith('/') ? existsSync(join(target, 'index.html')) : exists;
    ok(target.startsWith(PUB) && isDirOk, `${f}: бите посилання ${u}`);
    links++;
  }
}
ok(products === visible(catalog).length, `Product у розмітці: ${products}`);

// ціни в таблиці гайду збігаються з варіантами 10 м
for (const r of retroTable(catalog)) {
  for (const side of [r.out, r.inn]) if (side) ok(catalog.products.some(p => p.variants.some(v => v.m === 10 && v.p === side.price)), `гайд: ціна ${side.price} не з каталогу`);
}
ok(retroTable(catalog).length >= 10, 'гайд: замало рядків');

// екранування і приховані товари
const ctx: Ctx = { base: 'https://example.com/' };
const evil = normalize({
  ...catalog,
  products: [
    { ...catalog.products[0], id: 'x-1', name: '<script>alert(1)</script> "лапки"', descr: '<img src=x onerror=alert(1)>' },
    { ...catalog.products[1], id: 'x-2', hidden: true }
  ]
});
const page = renderProduct(evil, evil.products[0], ctx);
ok(!page.includes('<script>alert') && !page.includes('<img src=x'), 'назва/опис не екрануються');
ok(!/<\/script>[^<]*alert/.test(page.split('application/ld+json')[1] ?? ''), 'JSON-LD не закривається назвою');
ok(!renderSitemap(evil, ctx).includes('x-2'), 'прихований товар у sitemap');
ok(!renderLlms(evil, ctx).includes('undefined'), 'llms.txt з undefined');

ok(pretty('Гірлянда Крок: 50см') === 'Гірлянда, крок 50 см', 'pretty: Крок');
ok(pretty('Гірлянда шаг: 75см') === 'Гірлянда, крок 75 см', 'pretty: шаг');

console.log(`${files.length} сторінок, ${products} товарів у розмітці, ${links} посилань перевірено`);
if (fails) { console.error(`${fails} помилок`); process.exit(1); }
console.log('OK');
