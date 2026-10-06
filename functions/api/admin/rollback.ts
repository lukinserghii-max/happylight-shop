/** POST {ver, baseVer} — відновити попередню версію (сама стає новою версією, тож відкат теж можна відкотити). */
import { historyGet, saveCatalog, CatalogError, type Env } from '../../../lib/catalog';
import { json } from '../../../lib/access';

type Data = { user: { email: string } };

export const onRequestPost: PagesFunction<Env, string, Data> = async ({ request, env, data }) => {
  let body: { ver?: string; baseVer?: string };
  try { body = await request.json(); } catch { return json(400, { ok: false, error: 'json' }); }
  const old = await historyGet(env, String(body.ver || ''));
  if (!old) return json(404, { ok: false, error: 'version not found' });
  try {
    const saved = await saveCatalog(env, request.url, old.data, data.user.email, `Відновлено версію від ${old.at.slice(0, 16).replace('T', ' ')}`, String(body.baseVer || ''));
    return json(200, { ok: true, ver: saved.ver, at: saved.at, catalog: saved.data });
  } catch (e) {
    if (e instanceof CatalogError) return json(e.message === 'conflict' ? 409 : 400, { ok: false, error: e.message });
    throw e;
  }
};
