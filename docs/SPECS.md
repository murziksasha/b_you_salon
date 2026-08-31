# B_You — специфікація продукту

## Мета

Сайт студії **B_You** («Be you! · студія краси»). У приміщенні **ліворуч магазин косметики**, **праворуч салон**. Один домен, напрямки не змішуються.

## Правила незмішування

1. Головна не продає: лише `doors-hero` + контакти.
2. Ліва двері = `/shop`, права = `/salon`. На мобільному магазин зверху, салон знизу.
3. Послуги — `services[]` і `/salon*`. Товари — `goods[]` і `/shop*`.
4. Cross-sell лише секція `zone-door` внизу зони.
5. CTA: салон — «Записатись»; магазин — «До кошика».
6. Ліди несуть `zone` / `serviceTitle`. Замовлення завжди shop.
7. Кошик у шапці салону лише якщо count > 0.
8. На всіх публічних сторінках (`/`, `/salon*`, `/shop*`, `/cart`, CMS-сторінки) у шапці є перемикач світла/темна тема. Вибір зберігається (`localStorage`) і застосовується до всього публічного UI. Адмінка — окремий світлий стіл, без цього перемикача.

## Моделі

- `SiteData`: settings, headerMenu, headerMenuSalon, headerMenuShop, servicesNav, pages, goods, services.
- `SalonService`: slug → `/salon/{slug}`, priceFrom, category.
- `Lead`: source `callback|booking`, zone, serviceId, comment.
- `Order`: `items[]`, total, fulfillment `pickup|delivery`, address.

## API

- `POST /api/contact` — запис/передзвінок (phone, serviceId?, comment?).
- `POST /api/orders` — кошик: `{ items: [{id, qty}], phone, fulfillment, address?, name?, comment? }`. Ціни знімає сервер. `inStock === false` → 400.
- Адмін: `/api/site` PUT/PATCH, leads, orders, inbox, media, auth — як proper_service.

## Межі MVP

Немає онлайн-оплати, календаря слотів, вибору майстра, SKU-відтінків, кількісного складу, акаунтів клієнтів, другої мови.

## Адмінка

Порт операційного контуру proper_service (Inbox, leads, orders, clients, constructor, goods, media, 2FA, digest, revisions). Додано `/admin/services`.
