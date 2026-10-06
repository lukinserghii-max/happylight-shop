/**
 * Сторінки для пошуковиків і нейромереж (ChatGPT, Claude, Perplexity не виконують JavaScript,
 * тому каталог, намальований app.js, для них порожній). Тут — чистий HTML без скриптів:
 * розділи, товари, гайд, sitemap.xml, robots.txt, llms.txt і розмітка schema.org.
 * Код без Node API: працює і в збірці (tools/build_pages.ts), і у функціях Cloudflare.
 */
import type { Catalog, Category, Product } from './catalog';

/** Адреса демо, поки сайт не переїхав. На Cloudflare перекривається змінною SITE_URL або адресою запиту. */
export const DEFAULT_SITE_URL = 'https://lukinserghii-max.github.io/happylight-shop/';
export const ASSET_V = '2';

/** Дані магазину — ті самі, що на головній (index.html). */
export const SHOP = {
  name: 'HappyLight',
  phone: '+380637100636',
  phoneText: '+380 63 710 06 36',
  telegram: 'https://t.me/zhukbogdan',
  instagram: 'https://www.instagram.com/happylight.in.ua/',
  street: 'вул. Юрія Кондратюка, 4',
  city: 'Дніпро',
  postal: '49000',
  seller: 'ФОП Жук Богдан Леонідович',
  sellerCode: '3516012074'
} as const;

/** Розділи з лампами, на які діє гарантія 2 роки (умови на головній). */
const LAMP_CATS = new Set(['r25', 'f4', 'f8', 'm4', 'm1', 'belt', 'loppy', 'lamps']);
/** Ретро-гірлянди на патронах: є крок, довжина, вулична/внутрішня версія. */
export const RETRO_CATS = ['r25', 'f4', 'f8', 'm4', 'm1'] as const;

export interface Ctx {
  /** Абсолютна адреса кореня сайту з «/» в кінці. */
  base: string;
}

// ---------- утиліти ----------
const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s: string): string => s.replace(/[&<>"']/g, c => ESC[c]);
const NBSP = '\u00a0';
/** 12500 → «12 500 грн» з нерозривними пробілами (однаково в Node і Workers). */
export const money = (n: number): string => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP) + NBSP + 'грн';
/** JSON для <script type="application/ld+json">: «<» екрануємо, щоб не закрити тег. */
const ld = (o: unknown): string => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;
const abs = (ctx: Ctx, path: string): string => ctx.base + path.replace(/^\//, '');

export const catPath = (id: string): string => `katalog/${id}/`;
export const productPath = (id: string): string => `tovar/${id}/`;
export const GUIDE_PATH = 'yak-obraty/';
export const CATALOG_PATH = 'katalog/';

export const visible = (c: Catalog): Product[] => c.products.filter(p => !p.hidden);
export const inCat = (c: Catalog, id: string): Product[] => visible(c).filter(p => p.cats.includes(id));

/** Мінімальна й максимальна ціна товару (з урахуванням варіантів). */
export function priceRange(p: Product): { lo: number; hi: number } | null {
  const ps = p.variants.map(v => v.p).filter((x): x is number => typeof x === 'number' && x > 0);
  if (!ps.length && p.price) ps.push(p.price);
  return ps.length ? { lo: Math.min(...ps), hi: Math.max(...ps) } : null;
}
function catRange(list: Product[]): { lo: number; hi: number } | null {
  const rs = list.map(priceRange).filter((r): r is { lo: number; hi: number } => r !== null);
  return rs.length ? { lo: Math.min(...rs.map(r => r.lo)), hi: Math.max(...rs.map(r => r.hi)) } : null;
}
const rangeText = (r: { lo: number; hi: number } | null): string =>
  !r ? 'ціну уточнюйте' : r.lo === r.hi ? money(r.lo) : `від ${money(r.lo)} до ${money(r.hi)}`;

/** Крок між лампами й тип (вулична/внутрішня) з назви: «… Крок: 50см», «… шаг: 75см». */
export function retroInfo(p: Product): { step: number | null; place: 'out' | 'in' | null } {
  const m = p.name.match(/(?:крок|шаг)\s*:?\s*(\d{2,3})\s*с/i);
  const place = /вулич/i.test(p.name) ? 'out' : /внутріш/i.test(p.name) ? 'in' : null;
  return { step: m ? Number(m[1]) : null, place };
}
/** Потужність лампи з назви розділу: «… 25 Вт» → 25. */
const catWatts = (c: Category): number | null => { const m = c.title.match(/(\d+)\s*Вт/); return m ? Number(m[1]) : null; };

const catById = (c: Catalog, id: string): Category | undefined => c.cats.find(x => x.id === id);

/** Опис товару: маркери «•» з Tilda перетворюємо на список. */
function descrHtml(d: string): string {
  const parts = d.split('•').map(s => s.trim()).filter(Boolean);
  if (parts.length > 1) return `<ul class="pg-ds">${parts.map(s => `<li>${esc(s)}</li>`).join('')}</ul>`;
  return d.trim() ? `<p class="pg-ds">${esc(d.trim())}</p>` : '';
}
/** Назва як у магазині (app.js prettyName): «… Крок: 50см» / «шаг: 50см» → «…, крок 50 см». */
export const pretty = (s: string): string => s.replace(/\s*(?:крок|шаг)\s*:\s*(\d+)\s*см?/i, ', крок $1 см').replace(/\s+/g, ' ').trim();
const plain = (s: string): string => s.replace(/•/g, ' ').replace(/\s+/g, ' ').trim();

// ---------- спільні шматки ----------
const ORG_ID = (ctx: Ctx): string => abs(ctx, '#store');

function storeLd(ctx: Ctx): Record<string, unknown> {
  return {
    '@type': 'Store', '@id': ORG_ID(ctx), name: SHOP.name, url: ctx.base,
    description: 'Ретро-гірлянди власного виробництва для терас, дворів, кав\'ярень і закладів. Дніпро, доставка Новою Поштою по Україні.',
    logo: abs(ctx, 'assets/img/logo.png'), image: abs(ctx, 'assets/hero-ending.jpg'),
    telephone: SHOP.phone,
    address: { '@type': 'PostalAddress', streetAddress: SHOP.street, addressLocality: SHOP.city, postalCode: SHOP.postal, addressCountry: 'UA' },
    areaServed: { '@type': 'Country', name: 'Україна' },
    currenciesAccepted: 'UAH', paymentAccepted: 'Накладений платіж, безготівковий рахунок ФОП, готівка при самовивозі',
    sameAs: [SHOP.instagram, SHOP.telegram]
  };
}
function crumbsLd(ctx: Ctx, items: Array<[string, string]>): Record<string, unknown> {
  return { '@type': 'BreadcrumbList', itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: abs(ctx, path) })) };
}
function crumbsHtml(rel: string, items: Array<[string, string]>): string {
  return `<nav class="crumbs" aria-label="Ви тут"><ol>${items.map(([name, path], i) =>
    i === items.length - 1 ? `<li aria-current="page">${esc(name)}</li>` : `<li><a href="${rel}${path}">${esc(name)}</a></li>`).join('')}</ol></nav>`;
}

interface PageOpts { ctx: Ctx; rel: string; path: string; title: string; description: string; image?: string; lds: Array<Record<string, unknown>>; body: string; catalog: Catalog; noindex?: boolean }

function page(o: PageOpts): string {
  const url = abs(o.ctx, o.path);
  const img = abs(o.ctx, o.image ?? 'assets/hero-ending.jpg');
  const graph = ld({ '@context': 'https://schema.org', '@graph': o.lds });
  const cats = o.catalog.cats.filter(c => inCat(o.catalog, c.id).length > 0);
  return `<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' data:; font-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'self'; object-src 'none'">
<meta name="referrer" content="strict-origin-when-cross-origin">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}">
${o.noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${esc(url)}">`}
<meta property="og:type" content="website">
<meta property="og:locale" content="uk_UA">
<meta property="og:site_name" content="HappyLight">
<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(img)}">
<meta name="theme-color" content="#0e1020">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%230e1020'/%3E%3Ccircle cx='32' cy='28' r='15' fill='%23f2b45a'/%3E%3C/svg%3E">
<link rel="stylesheet" href="${o.rel}assets/css/pages.css?v=${ASSET_V}">
${graph}
</head>
<body>
<header class="pg-top">
  <a class="pg-logo" href="${o.rel}" aria-label="HappyLight, на головну"><img src="${o.rel}assets/img/logo.png" width="98" height="76" alt="HappyLight"></a>
  <nav class="pg-nav" aria-label="Розділи сайту">
    <a href="${o.rel}#shop">Магазин</a>
    <a href="${o.rel}${CATALOG_PATH}">Каталог</a>
    <a href="${o.rel}${GUIDE_PATH}">Як обрати</a>
    <a href="${o.rel}#terms">Доставка й оплата</a>
  </nav>
  <a class="pg-btn pg-amber" href="${SHOP.telegram}" rel="noopener noreferrer">Telegram</a>
</header>
<main class="pg-main" id="main">
${o.body}
</main>
<footer class="pg-foot">
  <div class="pg-wrap pg-cols">
    <div><h2>HappyLight</h2><p>Ретро-гірлянди власного виробництва, ${SHOP.city}.<br>Самовивіз: ${SHOP.street}, ${SHOP.city}, ${SHOP.postal}.</p></div>
    <div><h2>Продавець</h2><p>${SHOP.seller}<br>РНОКПП ${SHOP.sellerCode}</p></div>
    <div><h2>Зв'язок</h2><p><a href="tel:${SHOP.phone}">${SHOP.phoneText}</a><br><a href="${SHOP.telegram}" rel="noopener noreferrer">Telegram</a> · <a href="${SHOP.instagram}" rel="noopener noreferrer">Instagram</a></p></div>
    <div><h2>Каталог</h2><ul>${cats.map(c => `<li><a href="${o.rel}${catPath(c.id)}">${esc(c.title)}</a></li>`).join('')}<li><a href="${o.rel}${GUIDE_PATH}">Як обрати ретро-гірлянду</a></li></ul></div>
  </div>
</footer>
</body>
</html>
`;
}

/** Умови магазину (з головної), коротко — для сторінок товарів. */
function termsList(p: Product): string {
  const items = [
    'Доставка Новою Поштою у відділення або кур\'єром, відправка за 1–3 робочі дні; самовивіз у Дніпрі.',
    'Оплата при отриманні, на рахунок ФОП або готівкою при самовивозі.'
  ];
  if (p.cats.some(c => LAMP_CATS.has(c))) items.push('Гарантія виробника на лампи — 2 роки.');
  items.push('Повернення товару належної якості — 14 днів (крім виробів під ваш розмір).');
  return `<ul class="pg-terms">${items.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`;
}

function card(rel: string, p: Product): string {
  const r = priceRange(p);
  return `<li class="pg-card"><a href="${rel}${productPath(p.id)}">${p.img ? `<img src="${rel}${esc(p.img)}" alt="${esc(pretty(p.name))}" width="400" height="400" loading="lazy">` : ''}<span class="pg-card-n">${esc(pretty(p.name))}</span><span class="pg-card-p">${r ? (r.lo === r.hi ? money(r.lo) : 'від ' + money(r.lo)) : 'ціна за запитом'}</span></a></li>`;
}

// ---------- товар ----------
export function renderProduct(c: Catalog, p: Product, ctx: Ctx): string {
  const rel = '../../';
  const name = pretty(p.name);
  const cat = catById(c, p.cats[0]);
  const r = priceRange(p);
  const url = abs(ctx, productPath(p.id));
  const descr = plain(p.descr);
  const metaDescr = `${name}. ${r ? (r.lo === r.hi ? 'Ціна ' + money(r.lo) : 'Ціна від ' + money(r.lo)) + '. ' : ''}${descr ? descr.slice(0, 120) + (descr.length > 120 ? '…' : '') + ' ' : ''}Доставка Новою Поштою по Україні, HappyLight, Дніпро.`;
  const hasOld = p.variants.some(v => v.o && v.p && v.o > v.p);
  const variants = p.variants.length ? `
  <section class="pg-sec"><h2>${esc(p.vt || 'Варіанти')} і ціни</h2>
  <div class="pg-tbl"><table><thead><tr><th scope="col">${esc(p.vt || 'Варіант')}</th><th scope="col">Ціна</th>${hasOld ? '<th scope="col">Стара ціна</th>' : ''}</tr></thead><tbody>
  ${p.variants.map(v => `<tr><th scope="row">${esc(v.l)}</th><td>${v.p ? money(v.p) : '—'}</td>${hasOld ? `<td>${v.o && v.p && v.o > v.p ? `<s>${money(v.o)}</s>` : ''}</td>` : ''}</tr>`).join('\n  ')}
  </tbody></table></div></section>` : '';
  const addons = p.addons.length ? `
  <section class="pg-sec"><h2>Опції до замовлення</h2>
  ${p.addons.map(a => `<h3>${esc(a.t)}</h3><ul class="pg-opts">${a.o.map(o => `<li>${esc(o.l)} <span>${o.p ? '+' + money(o.p) : 'без доплати'}</span></li>`).join('')}</ul>`).join('\n  ')}
  </section>` : '';
  const others = cat ? inCat(c, cat.id).filter(x => x.id !== p.id).slice(0, 12) : [];
  const offerBase = { priceCurrency: 'UAH', url, seller: { '@id': ORG_ID(ctx) } };
  const offers = r ? (p.variants.length > 1
    ? { '@type': 'AggregateOffer', ...offerBase, lowPrice: r.lo, highPrice: r.hi, offerCount: p.variants.filter(v => v.p).length }
    : { '@type': 'Offer', ...offerBase, price: r.lo }) : undefined;
  const productLd: Record<string, unknown> = {
    '@type': 'Product', '@id': url + '#product', name, url, sku: p.id,
    ...(p.img ? { image: abs(ctx, p.img) } : {}),
    description: descr || name,
    ...(cat ? { category: cat.title } : {}),
    ...(offers ? { offers } : {})
  };
  const crumbs: Array<[string, string]> = [['Головна', ''], ['Каталог', CATALOG_PATH], ...(cat ? [[cat.title, catPath(cat.id)] as [string, string]] : []), [name, productPath(p.id)]];
  const oldTop = p.old && r && p.old > r.lo ? ` <s>${money(p.old)}</s>` : '';
  const body = `<div class="pg-wrap">
${crumbsHtml(rel, crumbs)}
<article class="pg-product">
  <div class="pg-pgrid">
    ${p.img ? `<figure class="pg-photo"><img src="${rel}${esc(p.img)}" alt="${esc(name)}" width="800" height="800"></figure>` : ''}
    <div class="pg-info">
      ${cat ? `<p class="pg-kicker"><a href="${rel}${catPath(cat.id)}">${esc(cat.title)}</a></p>` : ''}
      <h1>${esc(name)}</h1>
      <p class="pg-price">${r ? (r.lo === r.hi ? money(r.lo) : 'від ' + money(r.lo)) : 'Ціну уточнюйте'}${oldTop}${p.unit ? ` <small>/ ${esc(p.unit)}</small>` : ''}</p>
      ${descrHtml(p.descr)}
      <div class="pg-row">
        <a class="pg-btn pg-ink" href="${rel}#p-${esc(p.id)}">Замовити на сайті</a>
        <a class="pg-btn pg-line" href="${SHOP.telegram}" rel="noopener noreferrer">Запитати в Telegram</a>
      </div>
      ${termsList(p)}
    </div>
  </div>
  ${variants}
  ${addons}
</article>
${others.length ? `<section class="pg-sec"><h2>Інші товари розділу «${esc(cat!.title)}»</h2><ul class="pg-cards">${others.map(x => card(rel, x)).join('')}</ul><p><a href="${rel}${catPath(cat!.id)}">Усі товари розділу →</a></p></section>` : ''}
</div>`;
  return page({
    ctx, rel, path: productPath(p.id), catalog: c, image: p.img || undefined,
    title: `${name} — ${r ? (r.lo === r.hi ? money(r.lo) : 'від ' + money(r.lo)) : 'HappyLight'} | HappyLight`,
    description: metaDescr,
    lds: [storeLd(ctx), productLd, crumbsLd(ctx, crumbs)],
    body
  });
}

// ---------- розділ ----------
/** Факти про розділ, порахувані з каталогу (без вигаданих характеристик). */
export function catFacts(c: Catalog, cat: Category): string[] {
  const list = inCat(c, cat.id);
  const facts = [`${list.length} ${plural(list.length, 'товар', 'товари', 'товарів')}, ціни ${rangeText(catRange(list))}.`];
  if ((RETRO_CATS as readonly string[]).includes(cat.id)) {
    const steps = [...new Set(list.map(p => retroInfo(p).step).filter((x): x is number => x !== null))].sort((a, b) => a - b);
    const lens = list.flatMap(p => p.variants.map(v => v.m)).filter((x): x is number => x !== null);
    const places = new Set(list.map(p => retroInfo(p).place));
    if (lens.length) facts.push(`Довжина від ${Math.min(...lens)} до ${Math.max(...lens)} м, лампи вже в комплекті.`);
    if (steps.length) facts.push(`Крок між лампами: ${steps.join(', ')} см.`);
    if (places.has('out') && places.has('in')) facts.push('Є вуличні та внутрішні версії; внутрішня дешевша.');
    const w = catWatts(cat);
    if (w) facts.push(`Потужність однієї лампи — ${w} Вт.`);
  }
  return facts;
}
const plural = (n: number, one: string, few: string, many: string): string => {
  const a = n % 10, b = n % 100;
  return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many;
};

export function renderCategory(c: Catalog, cat: Category, ctx: Ctx): string {
  const rel = '../../';
  const list = inCat(c, cat.id);
  const facts = catFacts(c, cat);
  const url = abs(ctx, catPath(cat.id));
  const crumbs: Array<[string, string]> = [['Головна', ''], ['Каталог', CATALOG_PATH], [cat.title, catPath(cat.id)]];
  const otherCats = c.cats.filter(x => x.id !== cat.id && inCat(c, x.id).length);
  const body = `<div class="pg-wrap">
${crumbsHtml(rel, crumbs)}
<header class="pg-head">
  <h1>${esc(cat.title)}</h1>
  <ul class="pg-facts">${facts.map(f => `<li>${esc(f)}</li>`).join('')}</ul>
  <div class="pg-row"><a class="pg-btn pg-ink" href="${rel}#cat-${esc(cat.id)}">Відкрити в магазині</a>${(RETRO_CATS as readonly string[]).includes(cat.id) ? `<a class="pg-btn pg-line" href="${rel}${GUIDE_PATH}">Порівняти типи ламп</a>` : ''}</div>
</header>
<ul class="pg-cards">${list.map(p => card(rel, p)).join('')}</ul>
<section class="pg-sec"><h2>Інші розділи</h2><ul class="pg-links">${otherCats.map(x => `<li><a href="${rel}${catPath(x.id)}">${esc(x.title)}</a></li>`).join('')}</ul></section>
</div>`;
  return page({
    ctx, rel, path: catPath(cat.id), catalog: c, image: list[0]?.img || undefined,
    title: `${cat.title}: ціни, купити в Україні | HappyLight`,
    description: `${cat.title} від HappyLight (Дніпро). ${facts.join(' ')} Доставка Новою Поштою.`.slice(0, 300),
    lds: [storeLd(ctx), {
      '@type': 'CollectionPage', '@id': url, url, name: cat.title, inLanguage: 'uk',
      mainEntity: { '@type': 'ItemList', numberOfItems: list.length, itemListElement: list.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(ctx, productPath(p.id)), name: pretty(p.name) })) }
    }, crumbsLd(ctx, crumbs)],
    body
  });
}

// ---------- усі розділи ----------
export function renderCatalogIndex(c: Catalog, ctx: Ctx): string {
  const rel = '../';
  const cats = c.cats.filter(x => inCat(c, x.id).length);
  const crumbs: Array<[string, string]> = [['Головна', ''], ['Каталог', CATALOG_PATH]];
  const total = visible(c).length;
  const body = `<div class="pg-wrap">
${crumbsHtml(rel, crumbs)}
<header class="pg-head"><h1>Каталог HappyLight</h1><p class="pg-lede">${total} ${plural(total, 'товар', 'товари', 'товарів')} у ${cats.length} розділах: ретро-гірлянди на патронах, Belt Light, Loppy Light, Profi-light, гірлянди для дому, лампи, аксесуари для монтажу, ліхтарі та новорічні фігури.</p></header>
<ul class="pg-catlist">${cats.map(x => { const l = inCat(c, x.id); const img = l[0]?.img; return `<li><a href="${rel}${catPath(x.id)}">${img ? `<img src="${rel}${esc(img)}" alt="" width="400" height="400" loading="lazy">` : ''}<b>${esc(x.title)}</b><span>${l.length} шт · ${esc(rangeText(catRange(l)))}</span></a></li>`; }).join('')}</ul>
</div>`;
  return page({
    ctx, rel, path: CATALOG_PATH, catalog: c,
    title: 'Каталог ретро-гірлянд і новорічного декору | HappyLight',
    description: `Каталог HappyLight: ${total} товарів — ретро-гірлянди, Belt Light, Loppy Light, лампи, аксесуари, новорічні фігури. Ціни, доставка Новою Поштою з Дніпра.`,
    lds: [storeLd(ctx), { '@type': 'CollectionPage', '@id': abs(ctx, CATALOG_PATH), url: abs(ctx, CATALOG_PATH), name: 'Каталог HappyLight', inLanguage: 'uk',
      hasPart: cats.map(x => ({ '@type': 'CollectionPage', name: x.title, url: abs(ctx, catPath(x.id)) })) }, crumbsLd(ctx, crumbs)],
    body
  });
}

// ---------- гайд «Як обрати» ----------
export interface RetroRow { cat: Category; step: number; out: { price: number; lamps: number | null } | null; inn: { price: number; lamps: number | null } | null; watts: number | null }

/** Таблиця для порівняння: ціна готової гірлянди 10 м за типом ламп, кроком і місцем. */
export function retroTable(c: Catalog, metres = 10): RetroRow[] {
  const rows: RetroRow[] = [];
  for (const id of RETRO_CATS) {
    const cat = catById(c, id);
    if (!cat) continue;
    const list = inCat(c, id);
    const steps = [...new Set(list.map(p => retroInfo(p).step).filter((x): x is number => x !== null))].sort((a, b) => a - b);
    for (const step of steps) {
      const pick = (place: 'out' | 'in') => {
        const p = list.find(x => { const i = retroInfo(x); return i.step === step && i.place === place; });
        const v = p?.variants.find(x => x.m === metres && x.p);
        return v && v.p ? { price: v.p, lamps: v.n } : null;
      };
      const out = pick('out'), inn = pick('in');
      if (out || inn) rows.push({ cat, step, out, inn, watts: catWatts(cat) });
    }
  }
  return rows;
}

export function renderGuide(c: Catalog, ctx: Ctx): string {
  const rel = '../';
  const rows = retroTable(c);
  const crumbs: Array<[string, string]> = [['Головна', ''], ['Як обрати ретро-гірлянду', GUIDE_PATH]];
  const retro = RETRO_CATS.map(id => catById(c, id)).filter((x): x is Category => !!x && inCat(c, x.id).length > 0);
  const retroMin = catRange(retro.flatMap(x => inCat(c, x.id)));
  const lampsAt = (step: number) => rows.find(r => r.step === step)?.out?.lamps ?? rows.find(r => r.step === step)?.inn?.lamps ?? null;
  const stepNote = [50, 75, 100].map(s => [s, lampsAt(s)] as const).filter(([, n]) => n !== null);
  const others = c.cats.filter(x => !(RETRO_CATS as readonly string[]).includes(x.id) && inCat(c, x.id).length);
  const bothPlaces = retro.every(x => { const pl = new Set(inCat(c, x.id).map(p => retroInfo(p).place)); return pl.has('out') && pl.has('in'); });
  const lens = retro.flatMap(x => inCat(c, x.id)).flatMap(p => p.variants.map(v => v.m)).filter((x): x is number => x !== null);
  const table = rows.length ? `<div class="pg-tbl"><table>
<caption>Ціна готової гірлянди довжиною 10 м (лампи в комплекті)</caption>
<thead><tr><th scope="col">Тип ламп</th><th scope="col">Крок</th><th scope="col">Ламп на 10 м</th><th scope="col">Вулична</th><th scope="col">Внутрішня</th></tr></thead>
<tbody>
${rows.map(r => `<tr><th scope="row"><a href="${rel}${catPath(r.cat.id)}">${esc(r.cat.short)}</a></th><td>${r.step} см</td><td>${r.out?.lamps ?? r.inn?.lamps ?? '—'}</td><td>${r.out ? money(r.out.price) : '—'}</td><td>${r.inn ? money(r.inn.price) : '—'}</td></tr>`).join('\n')}
</tbody></table></div>` : '';
  const body = `<div class="pg-wrap pg-article">
${crumbsHtml(rel, crumbs)}
<article>
<h1>Як обрати ретро-гірлянду: тип ламп, крок, вулична чи внутрішня</h1>
<p class="pg-lede">Порівняння всіх ретро-гірлянд HappyLight за цінами з каталогу. Ціни вказані за готову гірлянду з лампами; ${retroMin ? `найдешевша — ${money(retroMin.lo)}` : 'актуальні ціни — у магазині'}. Дані оновлено ${esc(c.updated || '')}.</p>

<h2>Коротко</h2>
<ul>
<li>Є ${retro.length} типів ламп: ${retro.map(x => esc(x.short)).join(', ')}.</li>
<li>Крок між лампами — ${[...new Set(rows.map(r => r.step))].join(', ')} см. ${stepNote.length ? `На 10 м це ${stepNote.map(([s, n]) => `${n} ламп при кроці ${s} см`).join(', ')}.` : ''}</li>
<li>${bothPlaces ? 'Кожен тип є у вуличній і внутрішній версії. ' : ''}Вулична розрахована на вологу й перепади температури, внутрішня дешевша й підходить для приміщень, критих веранд і подій.</li>
<li>Диммер для регулювання яскравості можна додати до гірлянд з лампами розжарювання 25 Вт. Для LED-ламп сумісність уточнюйте в Telegram.</li>
<li>Нестандартну довжину виготовляють під замовлення.</li>
</ul>

<h2>Ціни на 10 метрів</h2>
${table}
${lens.length ? `<p class="pg-note">Довжини в магазині — від ${Math.min(...lens)} до ${Math.max(...lens)} м. Ціни інших довжин дивіться на сторінці кожної гірлянди.</p>` : ''}

<h2>Вулична чи внутрішня</h2>
<p>Вуличні гірлянди зроблені на цільному мідному дроті з сертифікатом якості й розраховані на вологу та перепади температури. Внутрішня версія дешевша; її беруть для приміщень, критих веранд і подій.</p>

<h2>Підключення і запасні лампи</h2>
<p>Гірлянда вмикається у звичайну розетку. Якщо розетка далеко, у замовленні можна додати запас дроту до розетки. На лампи діє гарантія виробника 2 роки; запасні лампи можна додати до замовлення або купити окремо в розділі <a href="${rel}${catPath('lamps')}">«Лампочки»</a>.</p>

<h2>Монтаж і оренда для закладів</h2>
<p>Для кафе, ресторанів і подій HappyLight рахує гірлянду й монтаж за фото чи відео місця. По Дніпру приїжджають на заміри; для весіль і відкриттів гірлянди дають в оренду з монтажем. Написати: <a href="${SHOP.telegram}" rel="noopener noreferrer">Telegram</a>, телефон <a href="tel:${SHOP.phone}">${SHOP.phoneText}</a>.</p>

<h2>Інші типи гірлянд</h2>
<ul class="pg-links">${others.map(x => `<li><a href="${rel}${catPath(x.id)}">${esc(x.title)}</a> — ${esc(rangeText(catRange(inCat(c, x.id))))}</li>`).join('')}</ul>
</article>
</div>`;
  return page({
    ctx, rel, path: GUIDE_PATH, catalog: c,
    title: 'Як обрати ретро-гірлянду: ціни, крок ламп, вулична чи внутрішня | HappyLight',
    description: `Порівняння ретро-гірлянд HappyLight: ${retro.length} типів ламп, крок 50/75/100 см, ціни за 10 м для вуличних і внутрішніх версій. Дніпро, доставка по Україні.`,
    lds: [storeLd(ctx), {
      '@type': 'Article', '@id': abs(ctx, GUIDE_PATH), headline: 'Як обрати ретро-гірлянду: тип ламп, крок, вулична чи внутрішня',
      inLanguage: 'uk', url: abs(ctx, GUIDE_PATH), ...(c.updated ? { dateModified: c.updated } : {}),
      author: { '@id': ORG_ID(ctx) }, publisher: { '@id': ORG_ID(ctx) }, image: abs(ctx, 'assets/hero-ending.jpg')
    }, crumbsLd(ctx, crumbs)],
    body
  });
}

// ---------- 404 ----------
export function renderNotFound(c: Catalog, ctx: Ctx, depth: number): string {
  const rel = '../'.repeat(depth);
  return page({
    ctx, rel, path: '', catalog: c, noindex: true, title: 'Сторінку не знайдено | HappyLight', description: 'Такої сторінки немає.', lds: [storeLd(ctx)],
    body: `<div class="pg-wrap"><header class="pg-head"><h1>Такої сторінки немає</h1><p class="pg-lede">Можливо, товар прибрали з продажу. Перегляньте <a href="${rel}${CATALOG_PATH}">каталог</a> або напишіть у <a href="${SHOP.telegram}" rel="noopener noreferrer">Telegram</a>.</p></header></div>`
  });
}

// ---------- службові файли ----------
export function renderSitemap(c: Catalog, ctx: Ctx): string {
  const lastmod = /^\d{4}-\d{2}-\d{2}$/.test(c.updated) ? c.updated : '';
  const urls = ['', CATALOG_PATH, GUIDE_PATH, ...c.cats.filter(x => inCat(c, x.id).length).map(x => catPath(x.id)), ...visible(c).map(p => productPath(p.id))];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `<url><loc>${esc(abs(ctx, u))}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`;
}

/** robots.txt: усі пошукові й AI-боти допущені; службові адреси закриті. */
export function renderRobots(ctx: Ctx): string {
  const bots = ['OAI-SearchBot', 'ChatGPT-User', 'GPTBot', 'Claude-SearchBot', 'Claude-User', 'ClaudeBot', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot-Extended'];
  const rules = 'Allow: /\nDisallow: /admin\nDisallow: /api/\n';
  return `# HappyLight: сайт відкритий для пошуковиків і AI-асистентів
User-agent: *
${rules}
${bots.map(b => `User-agent: ${b}`).join('\n')}
${rules}
Sitemap: ${abs(ctx, 'sitemap.xml')}
`;
}

/** llms.txt (формат llmstxt.org): короткий опис і посилання на головні сторінки. */
export function renderLlms(c: Catalog, ctx: Ctx): string {
  const cats = c.cats.filter(x => inCat(c, x.id).length);
  const rows = retroTable(c);
  return `# HappyLight

> HappyLight — інтернет-магазин з Дніпра (Україна): ретро-гірлянди власного виробництва на патронах з лампами розжарювання, філаментними та матовими LED-лампами, а також Belt Light, Loppy Light, Profi-light, гірлянди для дому, лампи, аксесуари для монтажу, ліхтарі та новорічні фігури. Доставка Новою Поштою по Україні.

- Відправка: 1–3 робочі дні, Нова Пошта (відділення або кур'єр); самовивіз: ${SHOP.street}, ${SHOP.city}.
- Оплата: при отриманні, на рахунок ФОП або готівкою при самовивозі.
- Гарантія виробника на лампи: 2 роки. Повернення товару належної якості: 14 днів (крім виробів під індивідуальний розмір).
- Для закладів: розрахунок і монтаж під ключ, оренда гірлянд для подій (Дніпро).
- Продавець: ${SHOP.seller}. Телефон: ${SHOP.phoneText}. Telegram: ${SHOP.telegram}
- Ціни в гривнях, актуальні на ${c.updated || 'дату оновлення каталогу'}.

## Каталог

${cats.map(x => `- [${x.title}](${abs(ctx, catPath(x.id))}): ${inCat(c, x.id).length} шт, ${rangeText(catRange(inCat(c, x.id)))}`).join('\n')}

## Порівняння ретро-гірлянд (ціна за 10 м)

${rows.map(r => `- ${r.cat.short}, крок ${r.step} см: вулична ${r.out ? money(r.out.price) : '—'}, внутрішня ${r.inn ? money(r.inn.price) : '—'}`).join('\n')}

## Сторінки

- [Як обрати ретро-гірлянду](${abs(ctx, GUIDE_PATH)}): типи ламп, крок, вулична чи внутрішня, ціни
- [Головна і магазин](${ctx.base}): конфігуратор, кошик, умови доставки й оплати, питання
- [Карта сайту](${abs(ctx, 'sitemap.xml')})
`.replace(/\u00a0/g, ' ');
}

// ---------- головна: блоки, що вставляє збірка ----------
export function indexHead(ctx: Ctx, faq: Array<{ q: string; a: string }>): string {
  return `<link rel="canonical" href="${esc(ctx.base)}">
<meta property="og:url" content="${esc(ctx.base)}">
<meta property="og:image" content="${esc(abs(ctx, 'assets/hero-ending.jpg'))}">
<link rel="alternate" type="text/plain" href="llms.txt" title="llms.txt">
${ld({ '@context': 'https://schema.org', '@graph': [
    storeLd(ctx),
    { '@type': 'WebSite', '@id': abs(ctx, '#website'), url: ctx.base, name: 'HappyLight', inLanguage: 'uk', publisher: { '@id': ORG_ID(ctx) } },
    ...(faq.length ? [{ '@type': 'FAQPage', '@id': abs(ctx, '#faq'), mainEntity: faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }] : [])
  ] })}`;
}

export function indexFooterCats(c: Catalog): string {
  const cats = c.cats.filter(x => inCat(c, x.id).length);
  return `<div class="foot-cats">
      <h3>Каталог</h3>
      <ul>${cats.map(x => `<li><a href="${catPath(x.id)}">${esc(x.short)}</a></li>`).join('')}<li><a href="${GUIDE_PATH}">Як обрати гірлянду</a></li></ul>
    </div>`;
}

/** Питання з блоку FAQ головної (<details><summary>…</summary><p>…</p>) для розмітки FAQPage. */
export function parseFaq(html: string): Array<{ q: string; a: string }> {
  const strip = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
  const out: Array<{ q: string; a: string }> = [];
  const re = /<details>\s*<summary>([\s\S]*?)<\/summary>\s*<p>([\s\S]*?)<\/p>\s*<\/details>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push({ q: strip(m[1]), a: strip(m[2]) });
  return out;
}

/** Вставляє вміст між маркерами <!-- seo:name --> … <!-- /seo:name -->. */
export function replaceBlock(html: string, name: string, content: string): string {
  const re = new RegExp(`(<!-- seo:${name} -->)[\\s\\S]*?(<!-- /seo:${name} -->)`);
  if (!re.test(html)) throw new Error(`немає маркера seo:${name}`);
  return html.replace(re, `$1\n${content}\n$2`);
}
