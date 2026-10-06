/**
 * Cloudflare Pages Function: POST /api/order
 * Перевіряє замовлення, перераховує суму за каталогом на сервері й надсилає його в Telegram.
 * Секрети лише в змінних середовища Cloudflare: TG_BOT_TOKEN, TG_CHAT_ID (у коді й репозиторії їх немає).
 */

import { loadCatalog, type Env as BaseEnv } from '../../lib/catalog';

type Env = BaseEnv & { TG_BOT_TOKEN: string; TG_CHAT_ID: string };

interface Variant { l: string; p: number | null; o: number | null; m: number | null; n: number | null }
interface AddonOpt { l: string; p: number }
interface Product { id: string; name: string; price: number | null; variants: Variant[]; addons: { t: string; o: AddonOpt[] }[]; hidden?: boolean }

interface OrderItem { id: string; vi: number; ai: number[]; q: number }
interface OrderIn {
  items: OrderItem[];
  customer: { name: string; phone: string };
  delivery: { type: 'np' | 'courier' | 'pickup'; city: string; point: string };
  payment: 'cod' | 'iban' | 'cash';
  comment: string;
  website: string;
  clientTotal?: number;
}

type Ctx = { request: Request; env: Env };

const MAX_BODY = 16_384;
const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const money = (n: number): string => new Intl.NumberFormat('uk-UA').format(Math.round(n)) + ' грн';
const isInt = (v: unknown, lo: number, hi: number): v is number => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Перевіряє форму запиту; повертає повідомлення про помилку або null. */
function validate(o: OrderIn): string | null {
  if (!o || typeof o !== 'object') return 'bad body';
  if (o.website) return 'spam';
  if (!Array.isArray(o.items) || o.items.length < 1 || o.items.length > 30) return 'items';
  for (const it of o.items) {
    if (typeof it?.id !== 'string' || !/^[\w-]{1,40}$/.test(it.id)) return 'item id';
    if (!isInt(it.vi, 0, 200) || !isInt(it.q, 1, 99)) return 'item numbers';
    if (!Array.isArray(it.ai) || it.ai.length > 10 || !it.ai.every(a => isInt(a, 0, 50))) return 'item addons';
  }
  const name = str(o.customer?.name, 60);
  if (name.length < 2) return 'name';
  if (!/^\+380\d{9}$/.test(str(o.customer?.phone, 20))) return 'phone';
  if (!['np', 'courier', 'pickup'].includes(o.delivery?.type)) return 'delivery';
  if (o.delivery.type !== 'pickup' && (str(o.delivery.city, 80).length < 2 || str(o.delivery.point, 120).length < 1)) return 'address';
  const allowedPay = o.delivery.type === 'pickup' ? ['cash', 'iban'] : ['cod', 'iban'];
  if (!allowedPay.includes(o.payment)) return 'payment';
  return null;
}

/** Ціна одиниці за каталогом: варіант + опції. */
function unitPrice(p: Product, vi: number, ai: number[]): number | null {
  const base = p.variants.length ? p.variants[vi]?.p ?? null : p.price;
  if (base === null || base === undefined) return null;
  let extra = 0;
  for (let i = 0; i < p.addons.length; i++) {
    const opt = p.addons[i].o[ai[i] ?? 0];
    if (!opt) return null;
    extra += opt.p;
  }
  return base + extra;
}

function describe(p: Product, vi: number, ai: number[]): string {
  const parts: string[] = [];
  if (p.variants.length) parts.push(p.variants[vi].l);
  p.addons.forEach((a, i) => {
    const j = ai[i] ?? 0;
    const o = a.o[j];
    if (o && (j > 0 || o.p > 0)) parts.push(`${a.t}: ${o.l}`);
  });
  return parts.join(' · ');
}

function orderId(): string {
  const d = new Date();
  const ymd = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  const rnd = crypto.getRandomValues(new Uint8Array(3));
  return `HL-${ymd}-${[...rnd].map(b => b.toString(36).padStart(2, '0')).join('').toUpperCase().slice(0, 4)}`;
}

async function handlePost({ request, env }: Ctx): Promise<Response> {
  // приймаємо лише запити з нашого ж сайту
  const origin = request.headers.get('Origin');
  if (origin && new URL(origin).host !== new URL(request.url).host) return json(403, { ok: false, error: 'origin' });
  if (!(request.headers.get('Content-Type') || '').includes('application/json')) return json(415, { ok: false, error: 'type' });
  if (!env.TG_BOT_TOKEN || !env.TG_CHAT_ID) return json(500, { ok: false, error: 'not configured' });

  const raw = await request.text();
  if (raw.length > MAX_BODY) return json(413, { ok: false, error: 'too large' });
  let o: OrderIn;
  try { o = JSON.parse(raw) as OrderIn; } catch { return json(400, { ok: false, error: 'json' }); }
  const bad = validate(o);
  if (bad === 'spam') return json(200, { ok: true, id: 'HL-0', total: 0 }); // бот не дізнається, що його відсіяли
  if (bad) return json(400, { ok: false, error: bad });

  // каталог читаємо з власних статичних файлів, ціни від клієнта не беремо
  // каталог той самий, що бачить покупець: KV з адмінки або запасний статичний JSON
  let products: Product[];
  try { products = (await loadCatalog(env, request.url)).data.products; } catch { return json(500, { ok: false, error: 'catalog' }); }
  const byId = new Map(products.filter(p => !p.hidden).map(p => [p.id, p]));

  let total = 0;
  const lines: string[] = [];
  for (const it of o.items) {
    const p = byId.get(it.id);
    if (!p) return json(400, { ok: false, error: 'unknown item' });
    if (p.variants.length && !p.variants[it.vi]) return json(400, { ok: false, error: 'variant' });
    const u = unitPrice(p, it.vi, it.ai);
    if (u === null) return json(400, { ok: false, error: 'price' });
    total += u * it.q;
    const d = describe(p, it.vi, it.ai);
    lines.push(`• ${esc(p.name)}${d ? `\n   ${esc(d)}` : ''}\n   ${it.q} × ${money(u)} = <b>${money(u * it.q)}</b>`);
  }

  const id = orderId();
  const D = { np: 'Нова Пошта, відділення', courier: 'Нова Пошта, кур’єр', pickup: 'Самовивіз, Дніпро' } as const;
  const P = { cod: 'при отриманні (накладений платіж)', iban: 'на рахунок ФОП', cash: 'готівкою' } as const;
  const city = str(o.delivery.city, 80), point = str(o.delivery.point, 120), comment = str(o.comment, 500);
  const text = [
    `🛒 <b>Замовлення ${id}</b>`,
    '',
    ...lines,
    '',
    `<b>Разом: ${money(total)}</b>`,
    typeof o.clientTotal === 'number' && Math.round(o.clientTotal) !== Math.round(total) ? `⚠️ На сайті клієнт бачив ${money(o.clientTotal)}` : '',
    '',
    `👤 ${esc(str(o.customer.name, 60))}`,
    `📞 ${esc(o.customer.phone)}`,
    `🚚 ${D[o.delivery.type]}${city ? `, ${esc(city)}` : ''}${point ? `, ${esc(point)}` : ''}`,
    `💳 ${P[o.payment]}`,
    comment ? `💬 ${esc(comment)}` : ''
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');

  const tg = await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TG_CHAT_ID, text, parse_mode: 'HTML', disable_web_page_preview: true })
  });
  if (!tg.ok) return json(502, { ok: false, error: 'telegram' });
  return json(200, { ok: true, id, total });
}

/** Єдина точка входу: лише POST, решта методів отримують 405. */
export const onRequest = (ctx: Ctx): Promise<Response> =>
  ctx.request.method === 'POST' ? handlePost(ctx) : Promise.resolve(json(405, { ok: false, error: 'method' }));
