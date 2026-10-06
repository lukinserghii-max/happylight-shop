/**
 * Генерує статичні сторінки для пошуковиків і AI-ботів з public/data/catalog.json:
 *   katalog/, katalog/<розділ>/, tovar/<товар>/, yak-obraty/, sitemap.xml, robots.txt, llms.txt
 * і оновлює блоки seo:head / seo:footer у public/index.html.
 *
 *   npx tsx tools/build_pages.ts            — записати
 *   npx tsx tools/build_pages.ts --check    — перевірити, що файли актуальні (для CI)
 *   SITE_URL=https://happylight.in.ua/ npx tsx tools/build_pages.ts — інший домен
 *
 * На Cloudflare ті самі сторінки віддають функції з актуального каталогу (KV), ці файли — запасний варіант і демо.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { normalize, type Catalog } from '../lib/catalog';
import {
  DEFAULT_SITE_URL, catPath, productPath, GUIDE_PATH, CATALOG_PATH, inCat, visible,
  renderCategory, renderProduct, renderCatalogIndex, renderGuide, renderSitemap, renderRobots, renderLlms,
  indexHead, indexFooterCats, parseFaq, replaceBlock, type Ctx
} from '../lib/seo';

const PUB = 'public';
const GEN_DIRS = ['katalog', 'tovar', 'yak-obraty'];

function siteUrl(): string {
  const raw = process.env.SITE_URL || DEFAULT_SITE_URL;
  const u = new URL(raw);
  if (u.protocol !== 'https:') throw new Error('SITE_URL має бути https');
  return u.origin + (u.pathname.endsWith('/') ? u.pathname : u.pathname + '/');
}

function build(): Map<string, string> {
  const raw = JSON.parse(readFileSync(join(PUB, 'data/catalog.json'), 'utf8')) as Partial<Catalog>;
  const c = normalize(raw);
  const ctx: Ctx = { base: siteUrl() };
  const out = new Map<string, string>();
  out.set(CATALOG_PATH + 'index.html', renderCatalogIndex(c, ctx));
  for (const cat of c.cats) if (inCat(c, cat.id).length) out.set(catPath(cat.id) + 'index.html', renderCategory(c, cat, ctx));
  for (const p of visible(c)) out.set(productPath(p.id) + 'index.html', renderProduct(c, p, ctx));
  out.set(GUIDE_PATH + 'index.html', renderGuide(c, ctx));
  out.set('sitemap.xml', renderSitemap(c, ctx));
  out.set('robots.txt', renderRobots(ctx));
  out.set('llms.txt', renderLlms(c, ctx));
  let index = readFileSync(join(PUB, 'index.html'), 'utf8');
  index = replaceBlock(index, 'head', indexHead(ctx, parseFaq(index)));
  index = replaceBlock(index, 'footer', '    ' + indexFooterCats(c));
  out.set('index.html', index);
  return out;
}

function listGenerated(): string[] {
  const files: string[] = [];
  const walk = (d: string) => { for (const e of readdirSync(join(PUB, d), { withFileTypes: true })) { const r = join(d, e.name); e.isDirectory() ? walk(r) : files.push(r); } };
  for (const d of GEN_DIRS) if (existsSync(join(PUB, d))) walk(d);
  return files;
}

const out = build();
if (process.argv.includes('--check')) {
  const stale: string[] = [];
  for (const [f, s] of out) if (!existsSync(join(PUB, f)) || readFileSync(join(PUB, f), 'utf8') !== s) stale.push(f);
  for (const f of listGenerated()) if (!out.has(f.split('\\').join('/'))) stale.push(f + ' (зайвий)');
  if (stale.length) { console.error('Застарілі SEO-сторінки, запустіть npm run build:pages:\n' + stale.slice(0, 20).join('\n')); process.exit(1); }
  console.log(`OK: ${out.size} файлів актуальні`);
} else {
  for (const d of GEN_DIRS) rmSync(join(PUB, d), { recursive: true, force: true });
  for (const [f, s] of out) { mkdirSync(dirname(join(PUB, f)), { recursive: true }); writeFileSync(join(PUB, f), s); }
  console.log(`Записано ${out.size} файлів для ${siteUrl()}`);
}
