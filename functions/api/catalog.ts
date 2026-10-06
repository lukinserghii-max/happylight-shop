/** GET /api/catalog — публічний каталог (KV або запасний статичний JSON), без прихованих товарів. */
import { loadCatalog, type Env } from '../../lib/catalog';
import { json } from '../../lib/access';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const { data } = await loadCatalog(env, request.url);
    const pub = { ...data, products: data.products.filter(p => !p.hidden) };
    return new Response(JSON.stringify(pub), {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=30' }
    });
  } catch {
    return json(503, { ok: false, error: 'catalog unavailable' });
  }
};
