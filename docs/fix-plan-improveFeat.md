# План исправлений и миграций — ветка `improveFeat`

База: `dev` @ `b5364c3`. Источник: аудит админ-панели (P0–P2 + общие пункты).
Принцип: каждый этап — отдельный PR в `dev`, мержится независимо, не ломает прод без миграции данных. Порядок этапов = рекомендуемый порядок мержа (зависимости помечены `[D]`).

Сводная таблица:

| Этап | Тема | Находки | Риск | Зависит от |
|---|---|---|---|---|
| 0 | Гигиена репозитория + CI | git cleanup, CI | низкий | — |
| 1 | Сессии и секреты | P0-3, P0-7 | средний | — |
| 2 | Доверие к прокси / IP | P0-4 | низкий | — |
| 3 | Серверные гарды страниц | P0-5 | низкий | — |
| 4 | CSRF / Origin + инверсия middleware | P0-6, P1-9 | средний | 2 |
| 5 | Единая обёртка API + Zod | P1-8, P1-10 | средний | 4 |
| 6 | Подтверждение паролем пользователя, TOTP под ролью | P0-2 (часть), P0-1 (часть) | средний | 5 |
| 7 | Per-user TOTP (миграция данных) | P0-2 | высокий | 6 |
| 8 | Отключение env-пароля после первого owner | P0-1 | высокий | 6, 7 |
| 9 | FSD: завершить или откатить | P1-11 | средний | 0 |
| 10 | Декомпозиция больших компонентов | P1-12 | средний | 9 |
| 11 | Производительность site.json | P2-13 | средний | 5 |
| 12 | Rate limit / lockout по логину | P2-14 | низкий | 5 |
| 13 | Тестовая матрица ролей + E2E | P2-15 | низкий | 3–8 |
| 14 | AGENTS.md и документация | общие | низкий | после 5, 9 |

---

## Этап 0 — Гигиена репозитория и CI

**Цель:** убрать артефакты из git, добавить автоматическую проверку PR.

**Изменения:**
- `git rm -r --cached coverage tsconfig.tsbuildinfo data/ops-alerts.json`.
- `.gitignore`: добавить
  ```
  /coverage/
  ```
  (`*.tsbuildinfo` и `/data/*.json` уже есть — файлы просто были закоммичены раньше правила).
- `package.json` → `"check": "npm run typecheck && npm run lint && npm run test"`.
- Новый `.github/workflows/ci.yml`:
  ```yaml
  on: { pull_request: { branches: [dev, main] }, push: { branches: [dev] } }
  jobs:
    check:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with: { node-version: 20, cache: npm }
        - run: npm ci
        - run: npm run check
        - run: npm run format:check
  ```
  E2E (`test:smoke`) — отдельным job с `npx playwright install --with-deps chromium`, `ADMIN_PASSWORD=e2e-test-password`, необязательный на первом этапе.
- Опционально: `husky` + `lint-staged` (prettier + eslint на staged).

**Миграция данных:** нет. Важно: `data/ops-alerts.json` на проде остаётся (удаляется только из индекса).

**Тесты:** CI сам по себе. **Приёмка:** CI зелёный на PR; `git ls-files coverage` пуст.
**Риск:** низкий (если `format:check` упадёт на старом коде — сначала отдельный коммит `npm run format`).
**Коммиты:**
1. `chore: untrack coverage, tsbuildinfo, runtime data`
2. `chore: add npm run check`
3. `ci: add GitHub Actions check workflow`

---

## Этап 1 — Сессии и секреты (P0-3, P0-7)

**Цель:** устаревшая/неполная cookie не даёт прав; секрет подписи отделён от пароля.

**Изменения:**
- `lib/session.ts`
  - `getSecret()`: в production требовать `SESSION_SECRET` (длина ≥ 32). Fallback на `ADMIN_PASSWORD` оставить только при `NODE_ENV !== 'production'` **или** при `ALLOW_LEGACY_SESSION_SECRET=true` (переходный флаг, с `console.warn`).
    ```ts
    function getSecret(): string {
      const s = process.env.SESSION_SECRET;
      if (s && s.length >= 32) return s;
      const legacy = process.env.ADMIN_PASSWORD;
      if (process.env.NODE_ENV === 'production') {
        if (process.env.ALLOW_LEGACY_SESSION_SECRET === 'true' && legacy) {
          console.warn('[session] using ADMIN_PASSWORD as secret (deprecated)');
          return legacy;
        }
        throw new Error('FATAL: SESSION_SECRET (>=32 chars) is required in production');
      }
      return s || legacy || 'dev-insecure-session-secret-change-me';
    }
    ```
  - `parseSession()`: 3-частный токен (без claims) → `{ valid: false }` (раньше получал `operator`). После деплоя все такие пользователи просто перелогинятся.
  - `decodeClaims()`: убрать default `'operator'` — неизвестная/пустая роль → `null` → невалидно.
- `lib/auth.ts`
  - `getSessionClaims()`: удалить недостижимую строку `return ... 'operator'`; при `parsed.claims == null` → `null`.
- `lib/require-role.ts` → `resolveAdminAccess()`:
  - в multi-user режиме, если пользователь не найден: вернуть `null` **всегда**, кроме `username === 'admin'` с ролью `owner`/`legacy` **и** пока разрешён env-вход (см. этап 8, флаг `isEnvLoginAllowed()`; до этапа 8 — `true`).
  ```ts
  if (multi) {
    const user = await getAdminUserByUsername(username);
    if (user) return { ... };
    if (username === 'admin' && (cookieRole === 'owner' || cookieRole === 'legacy') && (await isEnvLoginAllowed()))
      return { username: 'admin', role: cookieRole, grants: [...capabilitiesFor(cookieRole)] };
    return null;
  }
  ```
- `app/admin/page.tsx`: чек-лист «SESSION_SECRET» — warn, если длина < 32.
- `.env.example`: `SESSION_SECRET=` с комментарием `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`; `scripts/rotate-secrets.mjs` — проверить, что генерирует ≥32 символа.

**Миграция / rollout:**
1. Перед деплоем: убедиться, что на проде задан `SESSION_SECRET` (≥32). Если нет — `npm run rotate-secrets` или временно `ALLOW_LEGACY_SESSION_SECRET=true`.
2. Деплой → все текущие сессии без claims и сессии, подписанные старым секретом, инвалидируются → один повторный вход.
3. Через 1–2 недели удалить `ALLOW_LEGACY_SESSION_SECRET` из env.

**Тесты** (`lib/session.test.ts`, `lib/require-role.test.ts`):
- 3-частный токен → invalid; claims без роли → invalid.
- prod без `SESSION_SECRET` → throw; с флагом → ok + warn; короткий секрет → throw.
- multi-user, cookie `owner` для удалённого пользователя `bob` → `null`; для `admin` → access.

**Приёмка:** удалённый пользователь получает 401 на любом admin API сразу, даже без `revokeSessionsByUsername`.
**Риск:** средний (принудительный релогин; падение старта при отсутствии секрета — смягчено флагом).
**Коммиты:**
1. `fix(session): require SESSION_SECRET in production`
2. `fix(session): reject tokens without claims`
3. `fix(auth): deny access for deleted users with stale owner cookie`
4. `test(session): cover secret and claims rules`

---

## Этап 2 — Доверие к прокси (P0-4)

**Цель:** нельзя обойти `ADMIN_IP_ALLOWLIST` подделкой `X-Real-IP`/`X-Forwarded-For`.

**Изменения:**
- `lib/admin-ip.ts`:
  ```ts
  export function trustProxy(): boolean {
    return process.env.TRUST_PROXY === 'true';
  }
  export function clientIpFromHeaders(headers: Headers, socketIp = ''): string {
    if (!trustProxy()) return normalizeIp(socketIp);
    // existing X-Real-IP / rightmost XFF logic
  }
  ```
- `middleware.ts`: передавать `request.ip ?? ''` (в Next 15 может отсутствовать вне Vercel → тогда при `TRUST_PROXY!=='true'` и непустом allowlist — fail closed + понятное сообщение в логах).
- `lib/require-admin-ip.ts`, `app/admin/layout.tsx`, `app/api/auth/route.ts`, `lib/rate-limit.ts` (`clientKey`) — использовать ту же функцию.
- Docker: `docker-compose.yml` → `TRUST_PROXY=true` (там nginx, `docker/nginx.conf` уже перезаписывает заголовки — проверить, что `X-Forwarded-For $remote_addr`, не `$proxy_add_x_forwarded_for`).
- pm2/Windows (`ecosystem.config.cjs`, `scripts/setup-prod.ps1`): по умолчанию `TRUST_PROXY=false`; если перед Next стоит nginx/Keenetic-прокси — явно `true`.
- `docs/deploy.md`: раздел «TRUST_PROXY».

**Миграция:** добавить переменную в `.env` на проде. Без неё и с непустым allowlist в pm2 без прокси — поведение строже (fail closed), а не мягче.

**Тесты** (`lib/admin-ip.test.ts`): `TRUST_PROXY=false` + поддельный `X-Real-IP: 127.0.0.1` → используется socket IP; `true` → заголовок.
**Приёмка:** `curl -H "X-Real-IP: <allowed>"` с чужого IP → 403 при `TRUST_PROXY=false`.
**Риск:** низкий–средний (можно «запереть» себя — в доке описать восстановление: очистить allowlist).
**Коммиты:**
1. `feat(security): TRUST_PROXY env for client IP resolution`
2. `chore(deploy): set TRUST_PROXY in docker compose, document`

---

## Этап 3 — Серверные гарды админ-страниц (P0-5)

**Цель:** роль проверяется на сервере, а не только в `OperatorRouteGuard`.

**Изменения:**
- Новый `lib/admin/page-guard.ts`:
  ```ts
  import { redirect, notFound } from 'next/navigation';
  export async function requirePageAccess(pathname: string) {
    const claims = await getSessionClaims();
    if (!claims) redirect(`/admin/login?from=${encodeURIComponent(pathname)}`);
    const access = await resolveAdminAccess(claims.username, claims.role);
    if (!access) redirect('/admin/login');
    if (!navAllowedForRole(access.role, pathname, access.grants))
      redirect(firstAllowedAdminPath(access.role, access.grants));
    return access;
  }
  ```
- `app/admin/layout.tsx`: после `getSession()` вызвать `requirePageAccess(pathname)` (pathname из `x-admin-pathname`, который ставит middleware). Важно: middleware должен **всегда перезаписывать** `x-admin-pathname` (и удалять его для `/admin/login`), чтобы клиент не мог его подсунуть.
- Каждая страница, отдающая данные (`app/admin/goods|services|pages|menu|settings|media|ops/page.tsx`), дополнительно вызывает `requirePageAccess('/admin/<x>')` — защита на случай клиентской навигации, где layout не перерендеривается.
- `app/admin/page.tsx`: блок «Конфиг (env)» и `OnboardingChecklist` с env-статусом — рендерить только при `roleCan(access.role, 'security_owner')`.
- `app/admin/settings/page.tsx`: передавать в клиент только секции, доступные роли.
- `components/admin/OperatorRouteGuard.tsx` оставить как UX-слой.

**Тесты:** unit на `requirePageAccess` (моки `redirect`); E2E — оператор открывает `/admin/goods` → редирект на `/admin/inbox`, в HTML нет `goods`.
**Приёмка:** `curl` с cookie оператора на `/admin/settings` → 307, не 200 с данными.
**Риск:** низкий. **Коммиты:**
1. `feat(admin): server-side page access guard`
2. `fix(admin): hide env/security checklist from non-owners`
3. `fix(middleware): always overwrite x-admin-pathname`

---

## Этап 4 — CSRF/Origin и инверсия списка защищённых API (P0-6, P1-9) `[D: 2]`

**Цель:** одна точка правды о публичных API; защита state-changing запросов от CSRF.

**Изменения:**
- `middleware.ts`:
  ```ts
  const PUBLIC_API: Array<{ path: string; methods?: string[] }> = [
    { path: '/api/health' },
    { path: '/api/contact', methods: ['POST'] },
    { path: '/api/orders', methods: ['POST'] },
    { path: '/api/cookie-consent' },
    { path: '/api/telegram/webhook' },
  ];
  // /api/auth POST/GET/DELETE — не public для IP-фильтра, но без сессии
  const isApi = pathname.startsWith('/api/');
  const isPublic = PUBLIC_API.some(p => matches(p, pathname, request.method));
  const isProtectedApi = isApi && !isPublic;
  ```
  `matcher`: `['/admin/:path*', '/api/:path*']`.
- CSRF: для `isProtectedApi` и методов `POST|PUT|PATCH|DELETE` проверять `Origin` (или `Referer`) == `SITE_URL`/`Host`; иначе 403 `{ error: 'Bad origin' }`. Исключения: cron `/api/backup` с секретом, `telegram/webhook`.
  ```ts
  function sameOrigin(req: NextRequest) {
    const origin = req.headers.get('origin') || req.headers.get('referer');
    if (!origin) return false;
    try { return new URL(origin).host === req.headers.get('host'); } catch { return false; }
  }
  ```
- Учесть `/api/import-feed` (сейчас не в списке — после инверсии защищён автоматически), `/uploads/[name]` (не API — не трогать), `/r/viber`.
- Удалить ручной список и комментарий в шапке `middleware.ts`.

**Тесты:** новый `middleware.test.ts` (вызов `middleware(new NextRequest(...))`): public пути проходят; `/api/import-feed` под IP-фильтром; POST без Origin → 403; cron с секретом → ok.
**Приёмка:** добавление нового `app/api/x/route.ts` защищено по умолчанию.
**Риск:** средний — может сломать интеграции без `Origin` (Telegram poll-скрипт `scripts/telegram-bot.ts` ходит в API? проверить; если да — Bearer-секрет как у backup).
**Коммиты:**
1. `refactor(middleware): deny-by-default API protection`
2. `feat(security): origin check for state-changing admin API`
3. `test(middleware): public/protected/csrf matrix`

---

## Этап 5 — Единая обёртка API + Zod (P1-8, P1-10) `[D: 4]`

**Цель:** все admin-роуты: роль + валидация + единый формат ошибок + логирование.

**Изменения:**
- Новый `lib/api/handler.ts`:
  ```ts
  type Ctx<B> = { req: NextRequest; access: AdminAccess; body: B };
  export function withAdmin<B = undefined>(
    cap: AdminCapability | null,
    schema: z.ZodType<B> | null,
    fn: (ctx: Ctx<B>) => Promise<Response>,
  ) {
    return async (req: NextRequest) => {
      const g = await requireAdminRole(cap ?? undefined);
      if (!g.ok) return g.response;
      let body = undefined as B;
      if (schema) {
        const raw = await req.json().catch(() => null);
        const p = schema.safeParse(raw);
        if (!p.success) return apiError(400, 'validation', p.error.issues);
        body = p.data;
      }
      try { return await fn({ req, access: g, body }); }
      catch (e) { console.error('[api]', req.nextUrl.pathname, e); return apiError(500, 'internal'); }
    };
  }
  export const apiError = (status: number, code: string, details?: unknown) =>
    NextResponse.json({ error: code, code, details }, { status });
  ```
- Новый `lib/api/audit.ts`: `safeAudit(entry)` — вместо пустых `catch {}` пишет `console.error('[audit] failed', e)`; заменить во всех роутах (`auth`, `users`, `sessions`, `backup`, …).
- Схемы в `lib/validation.ts` (или `lib/schemas/<domain>.ts`) и перевод роутов: `users`, `auth`, `auth/totp`, `import-feed`, `inbox`, `notify`, `telegram`, `upload` (formData-поля), `revisions`, `sessions`, `media/folders`, `media/purge`, `digest`, `clients`, `stats` (query), `smtp-test`.
  Пример `users`:
  ```ts
  const CreateUser = z.object({
    username: z.string().regex(/^[a-zA-Z0-9_.-]{2,32}$/),
    password: z.string().min(8).max(256),
    role: z.enum(['owner', 'editor', 'operator']).default('operator'),
    grants: z.array(z.enum(ADMIN_CAPABILITIES)).optional(),
    confirmPassword: z.string().min(1),
  });
  ```
- Клиенты (`lib/admin/saveSite.ts`, `handleSaveResult.ts`, панели) — поддержать `code`/`details` (обратно совместимо: `error` остаётся строкой).
- `lib/auth.ts` `getSessionClaims()` — мёртвая строка (если не удалена в этапе 1).

**Rollout:** роуты по одному коммиту на домен; формат ответа совместим (`error` сохранён).
**Тесты:** для каждого переведённого роута — `route.test.ts`: 401 без сессии, 403 без права, 400 на кривое тело, 200 happy path (паттерн как в `app/api/import-feed/route.test.ts`).
**Приёмка:** `rg "as \{" app/api` и `rg "catch \{\s*/\*" app/api` → пусто; все admin-роуты используют `withAdmin` или явно задокументированы.
**Риск:** средний (рефактор широкий, но механический). **Коммиты:**
1. `feat(api): withAdmin handler, apiError, safeAudit`
2. `refactor(api/users): zod + withAdmin`
3. …по одному на домен (`auth/totp`, `import-feed`, `inbox`, `notify`, `telegram`, `upload`, `media/*`, `revisions`, `sessions`, `digest`, `clients`, `stats`, `smtp-test`)
4. `test(api): route tests for converted handlers`

---

## Этап 6 — Подтверждение паролем самого пользователя; TOTP под ролью (P0-1 часть, P0-2 часть) `[D: 5]`

**Цель:** чувствительные операции подтверждаются паролем текущего пользователя, а не общим env-паролем; 2FA меняет только владелец безопасности.

**Изменения:**
- Новый `lib/admin/reauth.ts`:
  ```ts
  export async function verifyCurrentUserPassword(access: AdminAccess, password: string) {
    if (access.role === 'legacy' || access.username === 'admin' && !(await getAdminUserByUsername('admin')))
      return verifyPassword(password);            // env-режим
    const u = await getAdminUserByUsername(access.username);
    return !!u && (await verifyPasswordHash(password, u.passwordHash));
  }
  ```
- `app/api/users/route.ts`: `ownerPassword` → `confirmPassword`, проверка через `verifyCurrentUserPassword` (принимать старое поле `ownerPassword` как алиас один релиз).
- `app/api/auth/totp/route.ts`: `requireAdminSession()` → `withAdmin('security_owner', …)`; пароль — `verifyCurrentUserPassword`.
- `components/admin/UsersPanel.tsx`, `components/admin/TotpSetupPanel.tsx`: подпись поля «Ваш пароль» вместо «Пароль власника».

**Тесты:** оператор → 403 на `POST /api/auth/totp`; owner с неверным собственным паролем → 403; с env-паролем, но не своим (multi-user) → 403.
**Приёмка:** знание `ADMIN_PASSWORD` не позволяет оператору менять пользователей/2FA.
**Риск:** средний. **Коммиты:**
1. `feat(auth): re-auth with current user password`
2. `fix(totp): require security_owner capability`
3. `fix(users): confirm with own password (ownerPassword alias)`

---

## Этап 7 — Per-user TOTP (P0-2) `[D: 6]` — миграция данных

**Цель:** у каждого пользователя свой TOTP-секрет; глобальный секрет остаётся только для env-входа `admin`.

**Модель:** `lib/admin-users.ts` → `AdminUser`:
```ts
totp?: { secret: string; enabledAt: string; lastUsedStep?: number };
recoveryCodes?: string[]; // scrypt-хэши, опционально
```
`listAdminUsers()` не отдаёт `totp.secret`, только `totpEnabled: boolean`.

**Изменения:**
- `lib/totp.ts`: `verifyTotp(secret, code, lastUsedStep?)` возвращает шаг → защита от повторного использования кода.
- `lib/auth.ts` `authenticateLogin()`: возвращать `{ ok, claims, totpSecret? }` — секрет пользователя (multi-user) или глобальный (`getTotpSecret()`) для env-admin.
- `app/api/auth/route.ts`: проверять TOTP из результата аутентификации, а не глобально.
- `app/api/auth/totp/route.ts`: `begin/confirm/disable` для **текущего** пользователя; owner может `reset` 2FA другому пользователю (`POST /api/users` action `resetTotp`, `security_owner`).
- `lib/admin-totp.ts`: оставить для env-admin; добавить `migrateGlobalTotp()`.
- UI: `TotpSetupPanel` — «моя 2FA»; `UsersPanel` — колонка «2FA» + «Скинути 2FA»; настройка политики `requireTotpForRoles: AdminRole[]` в `data/security.json` (новый файл, atomic-write).

**Миграция `data/admin-totp.json` → `admins.json`:**
1. Скрипт `scripts/migrate-totp.ts` (`npm run migrate:totp`), идемпотентный, с `--dry-run`:
   - бэкап `admins.json` и `admin-totp.json` в `data/backups/pre-totp-<ts>/`;
   - если глобальный секрет есть: **не копировать** его всем (шарить секрет нельзя); вместо этого пометить `security.json: { legacyGlobalTotp: true }` — до тех пор, пока пользователь не настроит свой TOTP, при входе он проходит по глобальному коду (переходный режим), после первого входа UI принудительно ведёт на настройку личной 2FA.
   - `ADMIN_TOTP_SECRET` из env продолжает работать только для env-admin.
2. После того как у всех owner/editor есть личный TOTP — `legacyGlobalTotp=false`, `admin-totp.json` удалить вручную (инструкция в доке).

**Совместимость:** логин без пользователей (single-password) — без изменений.
**Тесты:** `lib/admin-users.test.ts` (секрет не утекает из `listAdminUsers`), `lib/totp.test.ts` (replay), `app/api/auth/route.test.ts` (user A не входит кодом user B; переходный режим), тест миграционного скрипта на temp `DATA_DIR`.
**Приёмка:** два пользователя с разными TOTP; код одного не подходит другому; повтор кода в том же окне отклоняется.
**Риск:** высокий (можно заблокировать вход). Митигировать: dry-run, бэкап, env-admin как break-glass до этапа 8, инструкция «сброс 2FA через удаление `totp` у пользователя в `admins.json`».
**Коммиты:**
1. `feat(users): per-user totp fields (hidden from list)`
2. `feat(auth): verify per-user totp at login, replay protection`
3. `feat(totp): self-service setup and owner reset`
4. `chore(scripts): migrate-totp with dry-run and backup`
5. `docs: per-user 2FA migration`

---

## Этап 8 — Отключение env-пароля после первого owner (P0-1) `[D: 6, 7]` — миграция

**Цель:** `ADMIN_PASSWORD` перестаёт быть мастер-ключом.

**Изменения:**
- Новый `lib/admin/env-login.ts`:
  ```ts
  export async function isEnvLoginAllowed(): Promise<boolean> {
    const mode = process.env.ADMIN_ENV_LOGIN ?? 'auto'; // auto | always | breakglass | off
    if (mode === 'always') return true;           // переходный режим
    if (mode === 'off') return false;
    const hasOwner = (await listAdminUsers()).some(u => u.role === 'owner' && !u.disabled);
    if (mode === 'auto') return !hasOwner;
    return process.env.ADMIN_BREAKGLASS === '1';  // breakglass: временно включается на время восстановления
  }
  ```
- `lib/auth.ts` `authenticateLogin()`: все ветки с `verifyPassword()` выполнять только при `isEnvLoginAllowed()`. Убрать ветку «username `admin` + env-пароль → owner» в multi-user режиме, если пользователь `admin` существует в `admins.json`.
- `lib/require-role.ts` (этап 1): fallback для cookie `admin` — тоже через `isEnvLoginAllowed()`.
- Вход по env (break-glass) → `appendActivity({kind:'security', message:'Break-glass login'})` + уведомление в Telegram.
- `app/api/auth/route.ts`: `ADMIN_PASSWORD` больше не обязателен, если есть owner (убрать 503).
- Onboarding: если пользователей нет, дашборд предлагает «Створіть власника» (`UsersPanel`).

**Rollout / миграция:**
1. Релиз с дефолтом `ADMIN_ENV_LOGIN=always` в `.env.example` и проде → поведение как сейчас.
2. Владелец создаёт личный owner-аккаунт (+ личный TOTP из этапа 7), проверяет вход.
3. Переключает `ADMIN_ENV_LOGIN=auto` → env-вход отключается автоматически.
4. В доке: восстановление — `ADMIN_ENV_LOGIN=breakglass` + `ADMIN_BREAKGLASS=1`, рестарт pm2, вход, сброс, вернуть.

**Тесты:** матрица режимов × наличие owner в `lib/auth.test.ts`; после `auto` + owner env-пароль → 401; break-glass пишет activity.
**Приёмка:** при наличии owner и `auto` env-пароль не работает ни на `/api/auth`, ни в `users`/`totp`.
**Риск:** высокий (локаут). Митигировано поэтапным флагом и break-glass.
**Коммиты:**
1. `feat(auth): ADMIN_ENV_LOGIN modes`
2. `fix(auth): env password not a master key once owner exists`
3. `feat(security): break-glass audit + telegram alert`
4. `docs(deploy): env login migration and recovery`

---

## Этап 9 — FSD: завершить или откатить (P1-11) `[D: 0]`

**Цель:** один источник правды для admin-компонентов.

**Факт:** в `features/*` >30 файлов по 0 байт (`features/admin-auth/*`, `cart-checkout/*`, `totp-setup/*`, все `index.ts`), непустые копии (`features/goods-editor/ui/GoodsEditor.tsx`, `features/page-constructor/ui/*`, `features/media-library/ui/*`) не импортируются (`git grep "@/features"` пусто); рабочий код в `components/admin/*`.

**Вариант A (рекомендуется, малым шагом) — завершить миграцию по фичам:**
1. Сравнить копии: `git diff --no-index components/admin/GoodsEditor.tsx features/goods-editor/ui/GoodsEditor.tsx` — перенести в `features/` правки, сделанные после рефактора в `components/admin` (коммит `d9a7e26` и др.).
2. Заполнить `features/<x>/index.ts` публичным API:
   ```ts
   export { GoodsEditor } from './ui/GoodsEditor';
   ```
3. Переключить импорты в `app/admin/goods/page.tsx` и т.д. на `@/features/goods-editor`.
4. Удалить старый файл из `components/admin`.
5. Одна фича = один коммит: `goods-editor`, `page-constructor`, `media-library`, `admin-auth` (`AdminRoleContext`, `IdleSessionGuard`, `OperatorRouteGuard`), `totp-setup`; затем публичные (`cart-checkout`, `callback-lead`, `quick-order`, `catalog-filter`, `cookie-consent`, `theme-switcher`).
6. ESLint-правило против импортов внутрь фичи: `no-restricted-imports` с паттерном `@/features/*/*`.

**Вариант B — откат:** удалить `features/` целиком одним коммитом, вернуться к FSD позже.

В обоих вариантах: удалить все 0-байтовые файлы; добавить CI-проверку `find features -size 0` → fail.
**Тесты:** typecheck + существующие + `AdminScrollNav.test.tsx`; ручной smoke админки.
**Приёмка:** нет дубликатов имён между `components/admin` и `features/*`; нет пустых файлов.
**Риск:** средний (потерять правки при сведении копий — поэтому diff перед удалением).
**Коммиты:** `refactor(fsd): migrate goods-editor`, `…page-constructor`, `…media-library`, `…admin-auth`, `…totp-setup`, `chore(fsd): remove empty stubs`, `chore(eslint): restrict deep feature imports`.

---

## Этап 10 — Декомпозиция больших компонентов (P1-12) `[D: 9]`

**Цель:** файлы < ~600 строк, логика в хуках, тестируемая.

**Изменения (пути после этапа 9):**
- `PageConstructor.tsx` (80 КБ) → `model/usePageDraft.ts` (state, dirty, undo), `model/usePagePublish.ts` (publish gate, scheduled publish), `ui/SectionList.tsx`, `ui/SectionToolbar.tsx`; `SectionFieldEditors.tsx` (28 КБ) → по файлу на тип секции в `ui/sections/`.
- `GoodsEditor.tsx` (60 КБ) → `model/useGoodsState.ts`, `model/useGoodsFilters.ts`, `model/useGoodsSave.ts`; UI: уже есть `GoodsBulkBar`, `ProductEditCard`; добавить `GoodsList.tsx`.
- `MediaLibrary.tsx` (42 КБ) → `useMediaQuery`, `useMediaUpload`, `MediaGrid`, `MediaFolderTree`.
- `InboxPanel.tsx` (41 КБ) → `useInboxStream` (SSE `/api/inbox/stream`), `InboxCard`, `InboxFilters`.
- Общие хуки: `lib/admin/useDirtyState.ts`, `lib/admin/useSaveShortcut.ts` (Ctrl+S), поверх существующих `useUnsavedGuard.ts`, `saveSite.ts`.

**Тесты:** unit на хуки через `@testing-library/react` + jsdom (уже есть в devDeps — vitest/jsdom).
**Приёмка:** ни одного admin-файла > 800 строк; поведение не изменилось (E2E этапа 13).
**Риск:** средний; делать после E2E-сетки, если возможно. **Коммиты:** по одному на компонент + `test(admin): hooks`.

---

## Этап 11 — Производительность site.json (P2-13) `[D: 5]`

**Цель:** не гонять и не перезаписывать весь документ ради одной секции.

**Изменения:**
- `lib/site-data.ts`: кэш в памяти по `mtimeMs`:
  ```ts
  let cache: { mtime: number; data: SiteData } | null = null;
  export async function getSiteData() {
    const st = await fs.stat(SITE_PATH);
    if (cache && cache.mtime === st.mtimeMs) return cache.data;
    const data = parseSiteData(JSON.parse(await fs.readFile(SITE_PATH, 'utf8')));
    cache = { mtime: st.mtimeMs, data };
    return data;
  }
  ```
  Сброс кэша в `saveSiteData`. Возвращать `structuredClone` или договориться о read-only (типом `Readonly`).
- Редакторы → `PATCH /api/site` по секции (`goods`, `settings`, `headerMenu`, `servicesNav`, `pages`, `shopLink`): `lib/admin/saveSite.ts` → `saveSiteSection(section, data, expectedUpdatedAt)`. Сервер: optimistic lock по `updatedAt` — при желании по секции (`sectionsUpdatedAt[section]`), чтобы редактор товаров не конфликтовал с редактором страниц.
- Страницы админки передают в клиент только нужную часть: `app/admin/goods/page.tsx` → `initialGoods={site.goods}` + `updatedAt`, а не `initialData={site}`.
- `GoodsEditor`: виртуализация списка (без новой зависимости — простое окно по `IntersectionObserver`/пагинация по 50) и debounce поиска.
- Опционально: `goods` вынести в `data/goods.json` — **не в этом этапе** (отдельная миграция).

**Тесты:** `lib/site-data.test.ts` (кэш инвалидируется после записи и после внешнего изменения файла), `route.test` PATCH с конфликтом секций.
**Приёмка:** сохранение одного товара при 2000+ товаров < 300 мс; размер payload страницы `/admin/goods` не включает `pages`.
**Риск:** средний (кэш → устаревшие данные при ручной правке файла — mtime это покрывает).
**Коммиты:** `perf(site-data): mtime cache`, `feat(admin): section-level save`, `perf(admin): pass only needed slices to editors`, `perf(goods-editor): paginate list`.

---

## Этап 12 — Rate limit и lockout (P2-14) `[D: 5]`

**Цель:** брутфорс не обходится сменой IP и не сбрасывается рестартом.

**Изменения:**
- `lib/rate-limit.ts`: опциональный файловый стор `data/rate-limit.json` (atomic-write, только для ключей `auth:*`), остальное в памяти.
- `app/api/auth/route.ts`: второй лимит по логину: `auth-user:<username>` — 5 неудачных за 15 мин → блок 15 мин; сброс при успехе. Ответ 429 без раскрытия, существует ли пользователь.
- Неудачные входы → `appendActivity({ kind: 'security', message: 'Failed login' })` (агрегированно), уведомление в Telegram при ≥ N.
- `clientKey` — через `clientIpFromHeaders` из этапа 2.

**Тесты:** `lib/rate-limit.test.ts` (persist между инстансами модуля), `auth/route.test.ts` (lockout по логину с разных IP).
**Приёмка:** 6-я неверная попытка для `bob` с другого IP → 429.
**Риск:** низкий (возможен DoS блокировкой чужого логина — окно короткое, owner может снять в UI сессий).
**Коммиты:** `feat(rate-limit): persistent store for auth keys`, `feat(auth): per-username lockout`, `feat(security): failed login alerts`.

---

## Этап 13 — Тесты: матрица ролей и E2E (P2-15) `[D: 3–8, частично можно раньше]`

**Цель:** регрессия прав ловится автоматически.

**Изменения:**
- `tests/helpers/admin.ts`: фабрика сессии `makeSessionCookie({ username, role })` (с тестовым `SESSION_SECRET`), temp `DATA_DIR` с `admins.json`.
- `app/api/__tests__/role-matrix.test.ts`: таблица `route × method × role → status`:
  ```ts
  const cases = [
    ['/api/users', 'GET', 'operator', 403],
    ['/api/site', 'PATCH', 'operator', 403, { section: 'settings' }],
    ['/api/auth/totp', 'POST', 'operator', 403],
    ['/api/inbox', 'GET', 'operator', 200],
    ['/api/backup', 'POST', 'editor', 403],
    // …все роуты
  ];
  ```
  Плюс тест «каждый файл `app/api/**/route.ts` присутствует в матрице» (через `fs.readdirSync`) — новый роут без строки в матрице валит CI.
- Сценарии: удалённый пользователь со старой cookie → 401; disabled → 401; смена роли → сессия отозвана.
- E2E `e2e/admin.spec.ts`: login (owner) → inbox → client card → pages → goods save → конфликт 409 во второй вкладке; login operator → нет пунктов меню контента и редирект с `/admin/goods`; 2FA-флоу с генерацией кода из секрета в тесте.
- `playwright.config.ts`: `webServer` с temp `DATA_DIR`, seed пользователей.
- CI (этап 0): включить E2E job как обязательный.

**Приёмка:** матрица покрывает 100% admin-роутов; E2E зелёные в CI.
**Риск:** низкий. **Коммиты:** `test: admin session helpers`, `test(api): role matrix`, `test(e2e): admin owner/operator flows`, `ci: require e2e`.

---

## Этап 14 — AGENTS.md и документация `[после 5 и 9]`

**Цель:** документы совпадают с кодом и помогают агентам/людям.

**Изменения:**
- `AGENTS.md`:
  - Разделить: `## Agent behavior` (стиль, circuit breaker) и `## Project rules`. Убрать инструментоспецифичное (`WaitMsBeforeAsync`, `write_to_file`) в отдельный раздел «Tool notes» или удалить.
  - Добавить «Карта проекта»: `app/admin/*` (страницы), `features/*` (FSD, публичный API через `index.ts`), `lib/*` (домен), `lib/api/handler.ts`, `lib/admin/*`, `data/*` (runtime, не коммитить).
  - Чек-лист «Новый admin API»: `withAdmin(cap, schema)` → Zod-схема в `lib/schemas` → строка в role-matrix → `safeAudit` → `route.test.ts`. Middleware трогать не нужно (deny-by-default).
  - Чек-лист «Новая admin-страница»: `requirePageAccess`, правило в `NAV_RULES` (`lib/admin-roles.ts`).
  - Команды: `npm run check`, `npm test -- <path>`, `npm run test:smoke`, `npm run migrate:totp -- --dry-run`.
  - Перечень env: `SESSION_SECRET`(≥32, обязателен), `TRUST_PROXY`, `ADMIN_ENV_LOGIN`, `ADMIN_BREAKGLASS`, `ADMIN_IP_ALLOWLIST`.
- `docs/architecture.md`: переписать раздел Auth (multi-user, роли/права, сессии/отзыв, per-user TOTP, env-login режимы, TRUST_PROXY, CSRF); обновить Rate limits; раздел Admin — FSD-структура и `withAdmin`.
- `docs/admin-improvement-plan.md`: добавить «Фаза 8 — безопасность и качество» со ссылкой на этот файл и чек-боксами этапов.
- `docs/deploy.md`: env-миграции (этапы 1, 2, 7, 8), процедура break-glass, бэкап перед миграцией.
- `docs/admin-guide.md`: личная 2FA, сброс 2FA пользователю, подтверждение своим паролем.
- `README.md`: проверить кодировку UTF-8 (без BOM), ссылка на `fix-plan-improveFeat.md`, `npm run check`.

**Приёмка:** нет упоминаний «пароль власника = ADMIN_PASSWORD»; AGENTS.md ≤ ~150 строк; ссылки в README рабочие.
**Коммиты:** `docs(agents): split behavior/project rules, add checklists`, `docs(architecture): auth & admin update`, `docs(deploy): security migrations`, `docs(admin-guide): personal 2FA`.

---

## Общий rollout на прод

1. Этапы 0–5 — без изменения данных; перед этапом 1 задать `SESSION_SECRET`, перед этапом 2 — `TRUST_PROXY`.
2. Этап 6 → проверить, что у владельца есть личный owner-аккаунт.
3. Этап 7 → `npm run migrate:totp -- --dry-run`, затем без `--dry-run`; каждый пользователь настраивает личную 2FA.
4. Этап 8 → релиз с `ADMIN_ENV_LOGIN=always`, проверка входа, затем `auto`.
5. Этапы 9–14 — независимо, в любом порядке с учётом `[D]`.
6. Перед каждым этапом с миграцией: `npm run backup` + `backup:offsite`.

## Карта находок → этапы

| Находка | Этап |
|---|---|
| P0-1 env-пароль как мастер-ключ | 6, 8 |
| P0-2 TOTP без роли, общий секрет | 6, 7 |
| P0-3 stale owner cookie, токен без claims | 1 |
| P0-4 доверие X-Real-IP | 2 |
| P0-5 роли только на клиенте, env-чеклист | 3 |
| P0-6 CSRF | 4 |
| P0-7 SESSION_SECRET fallback | 1 |
| P1-8 Zod не везде, дубли try/catch | 5 |
| P1-9 ручной список в middleware | 4 |
| P1-10 пустые catch у аудита, мёртвый код | 5 (и 1) |
| P1-11 FSD наполовину | 9 |
| P1-12 огромные компоненты | 10 |
| P2-13 весь site.json | 11 |
| P2-14 rate limit в памяти | 12 |
| P2-15 тесты ролей/E2E | 13 |
| git cleanup, CI | 0 |
| AGENTS.md, docs | 14 |
