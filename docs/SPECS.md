# B_You — специфікація продукту

## Мета

Сайт студії **B_You** («Be you! · студія краси»). У приміщенні **ліворуч магазин косметики**, **праворуч салон**. Один домен, напрямки не змішуються.

## Правила незмішування

1. Головна не продає: лише `doors-hero` + контакти.
2. Ліва двері = `/shop`, права = `/salon`. На мобільному магазин зверху, салон знизу.
3. Послуги — `services[]` і `/salon*`. Товари — `goods[]` і `/shop*`.
4. Cross-sell лише секція `zone-door` внизу зони.
5. CTA: салон — «Записатись»; магазин — «До кошика».
6. Ліди несуть `zone` / `serviceTitle` (запис салону). Замовлення — кошик або консультація по товарах (`source: shop|consult`).
7. Кошик у шапці салону лише якщо count > 0.
8. На всіх публічних сторінках (`/`, `/salon*`, `/shop*`, `/cart`, CMS-сторінки) у шапці є перемикач світла/темна тема. Вибір зберігається (`localStorage`) і застосовується до всього публічного UI. Адмінка — окремий світлий стіл, без цього перемикача.
9. На публічних сторінках унизу sticky-банер із запитом щодо cookie. Відповідь (`all` | `necessary`) пам’ятається на цьому пристрої (`localStorage` + first-party cookie `byou-cookie-consent`, 1 рік). Адмінка банер не показує. Текст банера в коді, не CMS; URL політики — з `settings.privacyPolicyUrl`.
10. Мобільне меню (burger): шухляда відкривається/закривається з плавною анімацією. Клік по «Записатись», будь-якому посиланню в меню (у т.ч. на секцію/якір сторінки), а також по backdrop чи кнопці X — закриває шухляду з тією ж анімацією.
11. У шапці активний лише найспецифічніший пункт меню (найдовший збіг шляху). Пункти-CTA з hash (наприклад «Записатись» → `/salon#callback`) не підсвічуються як active — це дія, не сторінка.
12. Салонна кнопка «Записатись» у шапці — pill (`border-radius: 999px`); на тій самій сторінці плавно скролить до `#callback` (з урахуванням `prefers-reduced-motion`) Якір `#callback` має `scroll-margin-top`, щоб sticky-хедер не перекривав заголовок блоку запису.
13. CMS HTML-сторінки (`content-page`, напр. Політика конфіденційності) завжди мають бічні відступи на вузьких екранах (як `by-wrap`), текст не прилипає до краю.
14. Контакти візуально по зонах: салон — лише Наталія (майстер-універсал); магазин — лише Ірина (продавець-консультант); головна — обидві картки. На головній у формі контактів — випадаючий вибір «запис/салон» або «консультація по товарах» (`intent`). `salon` → `/admin/leads` (`booking`) і Telegram «Запис». `shop` → `/admin/orders` (`consult`) і Telegram «Продаж». Усі форми `/salon*` — запис; `/shop*` і непорожній `/cart` — продаж.

## Моделі

- `SiteData`: settings, headerMenu, headerMenuSalon, headerMenuShop, servicesNav, pages, goods, services.
- `SalonService`: slug → `/salon/{slug}`, priceFrom, category.
- `Lead`: source `callback|booking`, zone, serviceId, comment.
- `Order`: `source shop|consult`, `items[]` (consult — плейсхолдер «Консультація по товарах»), total, fulfillment `pickup|delivery`, address.

## API

- `POST /api/contact` — запис/передзвінок (phone, serviceId?, comment?, intent?). Якщо `intent=shop` або сторінка `/shop*` — створює consult-замовлення, не лід.
- `POST /api/orders` — кошик: `{ items: [{id, qty}], phone, fulfillment, address?, name?, comment? }`. Без `items` дозволено лише sales-флоу (shop/cart/`intent=shop`) → консультація. Ціни знімає сервер. `inStock === false` → 400.
- Адмін: `/api/site` PUT/PATCH, leads, orders, inbox, media, auth — як proper_service.

## Межі MVP

Немає онлайн-оплати, календаря слотів, вибору майстра, SKU-відтінків, кількісного складу, акаунтів клієнтів, другої мови.

## Адмінка

Порт операційного контуру proper_service (Inbox, leads, orders, clients, constructor, goods, media, 2FA, digest, revisions). Додано `/admin/services`.

## Адмін Telegram-бот

Адмін-бот B_You — **черга оператора в Telegram**, не клієнтський канал і не заміна адмінки. Username бота не публікується на сайті.

Доступ: лише paired subscribers (`data/telegram-subscribers.json`) після одноразового коду з `/admin/ops`. Стороннім — тиша; `/start` без коду — «Немає доступу.» Ліміт: 20 команд/хв на `userId`. Процес: pm2 `byou-telegram` (long-poll). Пуші лідів/замовлень шле процес Next.js (`notifyLead` / `notifyOrder`).

### Картка пуша

```
Запис | Заявка | Продаж
ДД.ММ.РРРР, ГГ:ХХ
+38067***12
Статус: Нова
Послуга/Товар: …
коментар (якщо є)
```

1. **Маска телефону** у пуші та в списках «Останні записи/продажі»: `+38067***12`. Повний номер лише в `/find`, кнопці «Копіювати номер», файлах на диску.
2. **Статус** — лейбл workflow. Якщо є `assignee` — рядок `Відповідальний: {імʼя}`.
3. `tel:` у боті заборонений (не працює в Telegram).

Кнопки:

| Кнопка | Тип | Поведінка |
|---|---|---|
| Копіювати номер | `copy_text` | повний канонічний `+380…` |
| Viber | `url` | https-редірект `{SITE_URL}/r/viber?p=&s=` (HMAC) → `viber://chat?number=%2B380…`. Якщо `SITE_URL` непублічний — кнопки немає, у тексті рядок `Viber: viber://…` |
| Відкрити в адмінці | `url` | `{SITE_URL}/admin/clients?phone=` лише якщо публічний `SITE_URL` |
| Взяти в роботу | `callback` | єдиний запис статусу з бота |

### Коли слати пуш

Слати, якщо: є підписники потрібного типу без mute; не тихі години бота; у Inbox **немає іншого відкритого** елемента з тим самим телефоном (окрім щойно створеного). Повтор контакт-dedup (нотатка в існуючий open lead) не пушить.

Не слати, але заявку зберегти. Activity: `Telegram skip: open-phone` / `Telegram skip: quiet`.

Не стосується: ручний Telegram ↗ / bulk з Inbox; ops-алерти (backup/SMTP) — проходять тихі години, якщо не mute.

### Тихі години бота

Глобальні в store: `quietStart` / `quietEnd` / `timezone: Europe/Kyiv`. Типово 22→08. `start === end` вимикає тишу. Редагування: `/admin/ops` і команда `/quiet` (перегляд). Під час тиші лід/продаж не пушить; ops — так.

### Дайджест

Планувальник у процесі бота (не Next.js instrumentation).

1. **Ранковий** (`buildMorningDigest`) щодня о `quietEnd:00` Київ, раз на календарну дату, усім не-mute (`kind: ops`).
2. **Catch-up** при старті бота, якщо `now - lastAliveAt > 15 хв`: «Поки хост спав / Нових: N / Відкрито зараз: M». Порожній (N=0 і open=0) не слати. Інакше слати навіть у тихі години.
3. **Вечірній** (`buildEveningDigest`) о 18:00 Київ, раз на добу.

Поки хост спить, нічого не піде. Після пробудження — catch-up, далі розклад. `lastAliveAt` оновлюється не частіше ніж раз на 2 хв.

### «Взяти в роботу»

Свідомий вузький виняток з 2FA/IP-allowlist адмінки:

1. Кнопка лише якщо статус open і (немає assignee або assignee = цей оператор).
2. Перший тап — підтвердження. Без нього — no-op.
3. Так → `status: in_progress`, `assignee: firstName || username || linkedBy || telegram`. Audit `actor: tg:…`.
4. Заборонено з бота: `done`, `spam`, `no_answer`, `called`, `waiting`, outcome, note, delete.
5. Якщо вже взяв інший — «Вже в роботі: {assignee}».

### Редірект Viber

`GET /r/viber?p={digits}&s={hmac}` — публічний, без сесії (інакше кнопка мертва поза IP-allowlist). HMAC-SHA256 digits ключем `SESSION_SECRET`. 302 на `viber://chat?number=%2B{digits}`. Rate limit 30/хв/IP. Немає HTML з номером.
