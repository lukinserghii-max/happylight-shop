/**
 * Каталог HappyLight: читання (KV → запасний статичний JSON), перевірка й нормалізація, збереження з історією.
 * Спільний код для публічного API, адмінки та функції замовлення.
 */

export interface Env {
  CATALOG?: KVNamespace;
  MEDIA?: R2Bucket;
  ASSETS: Fetcher;
  TG_BOT_TOKEN?: string;
  TG_CHAT_ID?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ADMIN_EMAILS?: string;
  DEV_NO_ACCESS?: string;
  /** Адреса сайту для canonical, sitemap і розмітки (https://…/). Без неї — адреса запиту. */
  SITE_URL?: string;
}

export interface Variant { l: string; p: number | null; o: number | null; m: number | null; n: number | null }
export interface AddonOpt { l: string; p: number }
export interface Addon { t: string; o: AddonOpt[] }
export interface Product {
  id: string; cats: string[]; name: string; descr: string; unit: string; img: string;
  price: number | null; old: number | null; vt: string; variants: Variant[]; addons: Addon[];
  cfg?: { fam: string; place: 'out' | 'in'; step: number };
  hidden?: boolean;
}
export interface Category { id: string; title: string; short: string }
export interface SiteSettings { video: string; featured: string }
export interface Catalog { v: number; updated: string; cats: Category[]; products: Product[]; site: SiteSettings }
export interface Stored { ver: string; at: string; by: string; note: string; data: Catalog }
export interface HistoryEntry { ver: string; at: string; by: string; note: string }

const KEY = 'catalog';
const HIST_INDEX = 'hist:index';
const HIST_KEEP = 30;
const HIST_TTL = 60 * 60 * 24 * 120; // 120 днів
const DEFAULT_SITE: SiteSettings = { video: 'RSY_4CGofCc', featured: 'fig' };

export class CatalogError extends Error {}

/** Поточний каталог: спершу KV (якщо прив'язано й заповнено), інакше статичний data/catalog.json. */
export async function loadCatalog(env: Env, requestUrl: string): Promise<{ stored: Stored | null; data: Catalog }> {
  if (env.CATALOG) {
    const s = await env.CATALOG.get<Stored>(KEY, 'json');
    if (s?.data) return { stored: s, data: s.data };
  }
  const res = await env.ASSETS.fetch(new URL('/data/catalog.json', requestUrl).toString());
  if (!res.ok) throw new CatalogError('catalog asset ' + res.status);
  const raw = (await res.json()) as Partial<Catalog>;
  return { stored: null, data: normalize(raw) };
}

/** Зберігає нову версію, попередню кладе в історію. baseVer захищає від одночасних правок. */
export async function saveCatalog(env: Env, requestUrl: string, next: Catalog, by: string, note: string, baseVer: string | null): Promise<Stored> {
  if (!env.CATALOG) throw new CatalogError('KV CATALOG не підключено');
  const loaded = await loadCatalog(env, requestUrl);
  const curVer = loaded.stored?.ver ?? 'initial';
  if (baseVer !== null && baseVer !== curVer) throw new CatalogError('conflict');
  // перше збереження: початковий статичний каталог теж кладемо в історію, щоб до нього можна було повернутись
  const stored: Stored = loaded.stored ?? { ver: 'initial-' + newVer(), at: new Date().toISOString(), by: 'початковий каталог', note: 'Каталог до першої правки в адмінці', data: loaded.data };
  await env.CATALOG.put(`hist:${stored.ver}`, JSON.stringify(stored), { expirationTtl: HIST_TTL });
  const entry: Stored = { ver: newVer(), at: new Date().toISOString(), by, note: note.slice(0, 200), data: { ...next, updated: new Date().toISOString().slice(0, 10) } };
  await env.CATALOG.put(KEY, JSON.stringify(entry));
  const index = (await env.CATALOG.get<HistoryEntry[]>(HIST_INDEX, 'json')) ?? [];
  index.unshift({ ver: stored.ver, at: stored.at, by: stored.by, note: stored.note });
  await env.CATALOG.put(HIST_INDEX, JSON.stringify(index.slice(0, HIST_KEEP)));
  return entry;
}

export async function historyList(env: Env): Promise<HistoryEntry[]> {
  if (!env.CATALOG) return [];
  return (await env.CATALOG.get<HistoryEntry[]>(HIST_INDEX, 'json')) ?? [];
}

export async function historyGet(env: Env, ver: string): Promise<Stored | null> {
  if (!env.CATALOG || !/^[\w-]{6,40}$/.test(ver)) return null;
  return env.CATALOG.get<Stored>(`hist:${ver}`, 'json');
}

function newVer(): string {
  const b = crypto.getRandomValues(new Uint8Array(6));
  return Date.now().toString(36) + '-' + [...b].map(x => x.toString(16).padStart(2, '0')).join('');
}

// ---------- перевірка та нормалізація ----------
const ID = /^[\w-]{1,40}$/;
const CAT_ID = /^[a-z0-9-]{1,20}$/;
const IMG = /^(assets\/img\/p\/[\w.-]{1,60}\.webp|media\/p\/[\w-]{1,60}\.(webp|jpg|png))$/;
const YT = /^[\w-]{11}$/;
const FAMS = new Set(['r25', 'f4', 'f8', 'm4', 'm1']);

const s = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
function money(v: unknown, field: string): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'string' ? Number(v.replace(/\s/g, '')) : Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 10_000_000) throw new CatalogError(`невірна ціна: ${field}`);
  return Math.round(n);
}
const intOrNull = (v: unknown, lo: number, hi: number): number | null => (Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi ? (v as number) : null);

/** Повертає чистий каталог лише з відомими полями; кидає CatalogError на непридатних даних. */
export function normalize(raw: Partial<Catalog>): Catalog {
  if (!raw || !Array.isArray(raw.cats) || !Array.isArray(raw.products)) throw new CatalogError('немає розділів або товарів');
  if (raw.cats.length > 60 || raw.products.length > 2000) throw new CatalogError('забагато записів');
  const cats: Category[] = raw.cats.map((c, i) => {
    if (!c || !CAT_ID.test(String(c.id))) throw new CatalogError(`розділ #${i + 1}: невірний id`);
    const title = s(c.title, 80), short = s(c.short, 40) || title;
    if (!title) throw new CatalogError(`розділ ${c.id}: порожня назва`);
    return { id: c.id, title, short };
  });
  const catIds = new Set(cats.map(c => c.id));
  if (catIds.size !== cats.length) throw new CatalogError('повтор id розділу');
  const seen = new Set<string>();
  const products: Product[] = raw.products.map((p, i) => {
    if (!p || !ID.test(String(p.id))) throw new CatalogError(`товар #${i + 1}: невірний id`);
    if (seen.has(p.id)) throw new CatalogError(`повтор id товару ${p.id}`);
    seen.add(p.id);
    const name = s(p.name, 200);
    if (!name) throw new CatalogError(`товар ${p.id}: порожня назва`);
    const pc = (Array.isArray(p.cats) ? p.cats : []).filter(c => catIds.has(c));
    if (!pc.length) throw new CatalogError(`товар ${p.id}: немає розділу`);
    const img = s(p.img, 120);
    if (img && !IMG.test(img)) throw new CatalogError(`товар ${p.id}: невірний шлях фото`);
    const variants: Variant[] = (Array.isArray(p.variants) ? p.variants : []).slice(0, 60).map((v, j) => ({
      l: s(v?.l, 80) || `Варіант ${j + 1}`,
      p: money(v?.p, `${p.id} варіант ${j + 1}`),
      o: money(v?.o, `${p.id} стара ціна ${j + 1}`),
      m: intOrNull(v?.m, 0, 100000), n: intOrNull(v?.n, 0, 100000)
    }));
    const addons: Addon[] = (Array.isArray(p.addons) ? p.addons : []).slice(0, 10).map(a => ({
      t: s(a?.t, 80) || 'Опція',
      o: (Array.isArray(a?.o) ? a.o : []).slice(0, 40).map(o => ({ l: s(o?.l, 80) || '—', p: money(o?.p, `${p.id} опція`) ?? 0 }))
    })).filter(a => a.o.length > 0);
    const vp = variants.map(v => v.p).filter((x): x is number => x !== null);
    const price = vp.length ? Math.min(...vp) : money(p.price, `${p.id} ціна`);
    if (!price && !p.hidden) throw new CatalogError(`товар ${p.id}: немає ціни`);
    const out: Product = {
      id: p.id, cats: pc, name, descr: text(p.descr, 2000), unit: s(p.unit, 40), img,
      price, old: variants.length ? variants[0].o : money(p.old, `${p.id} стара ціна`),
      vt: variants.length ? s(p.vt, 40) || 'Варіант' : '', variants, addons
    };
    if (p.cfg && FAMS.has(p.cfg.fam) && (p.cfg.place === 'out' || p.cfg.place === 'in') && Number.isInteger(p.cfg.step)) out.cfg = { fam: p.cfg.fam, place: p.cfg.place, step: p.cfg.step };
    if (p.hidden === true) out.hidden = true;
    return out;
  });
  const site = raw.site ?? DEFAULT_SITE;
  const video = s(site.video, 20);
  const featured = s(site.featured, 20);
  return {
    v: 1, updated: s(raw.updated, 20), cats, products,
    site: { video: YT.test(video) ? video : '', featured: catIds.has(featured) ? featured : '' }
  };
}
