# B_You

Маркетинговий сайт студії краси **B_You**: салон праворуч, магазин косметики ліворуч. Один домен, два напрямки, спільна адмінка.

**Стек:** Next.js 15 · React 19 · TypeScript · Sass · Docker  
**CMS:** `data/site.json` (file-based, як у proper_service)

## Швидкий старт

```bash
cp .env.example .env
# задайте ADMIN_PASSWORD і SESSION_SECRET
npm install
npm run seed
npm run dev
```

- Сайт: [http://localhost:3000](http://localhost:3000)
- Адмінка: [http://localhost:3000/admin](http://localhost:3000/admin)

## Зони

| URL | Зміст |
|-----|--------|
| `/` | Дві двері (ліворуч магазин, праворуч салон) + контакти |
| `/salon` | Послуги, запис |
| `/salon/[slug]` | Лендінг послуги |
| `/shop` | Каталог косметики |
| `/cart` | Кошик → заявка менеджеру |
| `/admin` | Конструктор, заявки, замовлення, Inbox |

## Docker

Прод-стек: контейнер Next.js (`byou-app`) + nginx (`byou-nginx`).

```bash
cp .env.example .env
# задайте ADMIN_PASSWORD і SESSION_SECRET
# NGINX_PORT=8080 (за замовчуванням)
npm run docker:up
```

- Сайт: [http://localhost:8080](http://localhost:8080)
- Адмінка: [http://localhost:8080/admin](http://localhost:8080/admin)
- Логи: `npm run docker:logs`
- Стоп: `npm run docker:down`

Томи на диску хоста: `data/` (контент CMS, заявки), `public/uploads/` (медіа).

Dev з hot-reload у контейнері: `npm run docker:dev` (теж порт 8080).

## Скрипти

| Команда | Дія |
|---------|-----|
| `npm run dev` | Dev-сервер |
| `npm run seed` | Записати дефолтний контент у `data/site.json` |
| `npm test` | Vitest |
| `npm run test:smoke` | Playwright smoke |
| `npm run docker:up` | Prod-стек |

## Документація

- [SPECS](docs/SPECS.md)
- [Архітектура](docs/architecture.md)
- [Посібник адміна](docs/admin-guide.md)
- [Деплой](docs/deploy.md)
