/** GET — останні версії каталогу (до 30). */
import { historyList, type Env } from '../../../lib/catalog';
import { json } from '../../../lib/access';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => json(200, { ok: true, items: await historyList(env) });
