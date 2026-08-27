# Єдиний план поліпшення адмінки

Реалізація йде по фазах. Кожна фаза дає робочий результат сама по собі.

## Фаза 1 — Операції: передзвінки
- Фільтр/блок «Сьогодні» з таймлайном 09–18
- Snooze: +1 год, завтра 10:00, довільний час
- Прострочені `callbackAt` — червоний статус

## Фаза 2 — Картка клієнта
- `/admin/clients?phone=` — усі leads/orders, нотатки, UTM, статуси
- Deep-link з Inbox / dashboard

## Фаза 3 — Шаблони й сповіщення
- Шаблони з `{phone}`, `{product}`, `{name}` → copy / `viber://` / `tg://`
- Prefs: mute, quiet hours, «лише замовлення», badge у `document.title`

## Фаза 4 — Контент-безпека
- Diff: відкотити одне поле/секцію до live
- Секція: `hideOnMobile` / `hideOnDesktop` (публічний рендер)

## Фаза 5 — Каталог і publish
- Scheduled publish сторінки (`publishAt`)
- Історія цін товару
- UI «схожі товари» (related ids)

## Фаза 6 — Ops
- `/admin/activity` — audit з фільтрами
- Health alerts у Telegram (backup >48h, SMTP down) — throttled

## Фаза 7 — Якість
- E2E: login → inbox → client → pages
- Unit-тести на нові helpers

## Статус реалізації
- [x] Фаза 1–7 (базова реалізація в коді)
- [x] Процесні пакети: outcome/нотатка, assignee, publish gate, digest, metrics, catalog health, ops runbook
- Див. також `docs/admin-guide.md`

## Процеси (SOP)

1. **Лід:** new → «Взяв у роботу» → called/waiting/snooze → close з **outcome + note**
2. **Handoff:** вечірній digest → Telegram
3. **Контент:** draft → (опційно «На ревʼю») → publish gate (SEO/diff confirm) → live
4. **Каталог:** зміна ціни >20% confirm; publish checklist на visible
5. **Ранок:** ритуал на Dashboard + morning digest

## Поза скоупом (свідомо)
- БД / multi-instance Redis
- Collaborative editing / кошик / AI-CMS
