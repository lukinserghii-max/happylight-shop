# HappyLight · магазин ретро-гірлянд

Статичний сайт + одна серверна функція на Cloudflare Pages.

```
public/                 сайт (публікується)
  index.html
  assets/               css, js, шрифти, фото
  data/catalog.json     каталог (генерується tools/build_catalog.py)
  _headers              CSP і заголовки безпеки
functions/api/order.ts  POST /api/order → замовлення в Telegram
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

## Оновлення каталогу

```
python3 -I tools/build_catalog.py <папка_знімка> public
```

## Перевірки

```
npm install
npm run typecheck
CATALOG=public/data/catalog.json npm run test:order
```

Секрети ніколи не потрапляють у код чи репозиторій: лише змінні Cloudflare.
