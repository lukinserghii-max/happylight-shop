/** GET — каталог для редагування (разом із прихованими). PUT — зберегти нову версію. */
import { loadCatalog, saveCatalog, normalize, CatalogError, type Env, type Catalog } from '../../../lib/catalog';
import { json } from '../../../lib/access';

type Data = { user: { email: string } };
const MAX_BODY = 2_000_000;

export const onRequestGet: PagesFunction<Env, string, Data> = async ({ request, env, data }) => {
  const { stored, data: cat } = await loadCatalog(env, request.url);
  return json(200, { ok: true, ver: stored?.ver ?? 'initial', at: stored?.at ?? null, by: stored?.by ?? null, kv: !!env.CATALOG, user: data.user.email, catalog: cat });
};

export const onRequestPut: PagesFunction<Env, string, Data> = async ({ request, env, data }) => {
  if (!(request.headers.get('Content-Type') || '').includes('application/json')) return json(415, { ok: false, error: 'type' });
  const raw = await request.text();
  if (raw.length > MAX_BODY) return json(413, { ok: false, error: 'too large' });
  let body: { catalog: Catalog; baseVer: string; note?: string };
  try { body = JSON.parse(raw); } catch { return json(400, { ok: false, error: 'json' }); }
  try {
    const clean = normalize(body.catalog);
    const saved = await saveCatalog(env, request.url, clean, data.user.email, String(body.note || ''), String(body.baseVer || ''));
    return json(200, { ok: true, ver: saved.ver, at: saved.at, catalog: saved.data });
  } catch (e) {
    if (e instanceof CatalogError) return json(e.message === 'conflict' ? 409 : 400, { ok: false, error: e.message });
    throw e;
  }
};
