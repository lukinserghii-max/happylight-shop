# HappyLight · магазин ретро-гірлянд

Статичний сайт + одна серверна функція на Cloudflare Pages.

```
public/                 сайт (публікується)
  index.html
  assets/               css, js, шрифти, фото
  data/catalog.json     каталог (генерується tools/build_catalog.py)
  _headers              CSP і заголовки безпеки
functions/api/order.ts  POST /api/order → замовлення в Telegram
functions/katalog, tovar, yak-obraty, sitemap.xml, robots.txt, llms.txt, index.ts
                        SEO-сторінки з актуального каталогу (KV)
lib/seo.ts              рендер сторінок і розмітки schema.org (спільний для функцій і збірки)
tools/                  збірка каталогу, тест функції (не публікується)
```

## Деплой на Cloudflare Pages

1. Cloudflare → Workers & Pages → Create → Pages → Connect to Git → обрати цей репозиторій.
2. Build settings: Framework preset `None`, Build command порожньо, Build output directory `public`.
3. Settings → Variables and Secrets (Production), тип **Secret**:
   - `TG_BOT_TOKEN` — токен бота від @BotFather;
   - `TG_CHAT_ID` — числовий ID отримувача (дізнатися в @userinfobot).
4. Після зміни змінних: Deployments → Retry deployment.

Отримувач замовлень має один раз натиснути **Start** у боті, інакше Telegram не дозволить ботові писати першим.

## Адмінка (/admin)

Ціни, фото, відео, приховування товарів, назви розділів, історія й відкат. Працює лише на Cloudflare Pages.

1. **KV**: Workers & Pages → KV → Create namespace `happylight-catalog`. У проєкті Pages: Settings → Bindings → Add → KV namespace, назва змінної `CATALOG`.
2. **R2**: R2 → Create bucket `happylight-media`. Settings → Bindings → Add → R2 bucket, назва змінної `MEDIA`.
3. **Вхід (Cloudflare Access)**: Zero Trust → Access → Applications → Add → Self-hosted.
   - Домени: `<сайт>/admin*` і `<сайт>/api/admin*`.
   - Policy: Allow, Emails = e-mail адміністраторів. Вхід одноразовим кодом на пошту.
   - Скопіювати **Application Audience (AUD) Tag**.
4. **Змінні** (Settings → Variables, Production):
   - `ACCESS_TEAM_DOMAIN` = `<команда>.cloudflareaccess.com`
   - `ACCESS_AUD` = AUD з кроку 3
   - `ADMIN_EMAILS` = ті самі e-mail через кому
5. Retry deployment.

Без будь-якого з пунктів 3–4 адмінка відповідає 401: функції повторно перевіряють підпис токена Access.
До першого збереження сайт показує `data/catalog.json`; після нього каталог береться з KV, а початковий файл лишається в історії.

Локально: `.dev.vars` з `DEV_NO_ACCESS=1` (працює лише на localhost), далі
`npx wrangler pages dev public --kv CATALOG --r2 MEDIA --ip 127.0.0.1`.

## Пошук і нейромережі (SEO / GEO)

Боти ChatGPT (OAI-SearchBot, GPTBot), Claude (Claude-SearchBot, ClaudeBot) і Perplexity не виконують JavaScript,
тому каталог з `app.js` для них порожній. Для них є звичайні HTML-сторінки без скриптів:

- `/katalog/`, `/katalog/<розділ>/`, `/tovar/<товар>/` — ціни, варіанти, опції, умови, schema.org `Product` + `Offer`/`AggregateOffer`, `BreadcrumbList`;
- `/yak-obraty/` — порівняння ретро-гірлянд (ціна за 10 м за типом ламп, кроком, вулична/внутрішня);
- `/sitemap.xml`, `/robots.txt` (усі пошукові й AI-боти допущені, `/admin` і `/api/` закриті), `/llms.txt`;
- на головній — `Store`, `WebSite`, `FAQPage` (з блоку «Питання»), canonical і og з абсолютними адресами, каталог у футері.

На Cloudflare ці адреси віддають функції з KV, тож правки з адмінки одразу видно ботам; приховані товари дають 404 і зникають із sitemap.
Статичні копії в `public/` — для демо на GitHub Pages і як запасний варіант. Після зміни `data/catalog.json` або FAQ:

```
npm run build:pages     # перегенерувати
npm run check:pages     # перевірка актуальності (запускається і в GitHub Actions)
npm run test:seo        # розмітка, ціни, биті посилання, екранування
```

Домен: у Cloudflare додайте змінну `SITE_URL` (напр. `https://happylight.in.ua/`) — інакше береться адреса запиту.
Для статичних копій: `SITE_URL=https://happylight.in.ua/ npm run build:pages`.
На GitHub Pages сайт лежить у підпапці, тому `robots.txt` там не діє (боти читають його лише з кореня домену).

## Оновлення каталогу

```
python3 -I tools/build_catalog.py <папка_знімка> public
npm run build:pages
```

## Перевірки

```
npm install
npm run typecheck
CATALOG=public/data/catalog.json npm run test:order
npm run test:access
npm run check:pages && npm run test:seo
```

Секрети ніколи не потрапляють у код чи репозиторій: лише змінні Cloudflare.
