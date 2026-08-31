# Deploy

## Production Docker

```bash
cp .env.example .env
# set strong ADMIN_PASSWORD and SESSION_SECRET
# set SMTP credentials
docker compose up -d --build
```

Сервіси (`docker-compose.yml`):

| Service | Role |
|---------|------|
| `next-app` (`byou-app`) | Next.js standalone (`node server.js`) |
| `nginx` (`byou-nginx`) | reverse proxy + `/uploads` |

Локально за замовчуванням `NGINX_PORT=8080` → http://localhost:8080  
Адмінка: http://localhost:8080/admin

### Volumes

- site content → `DATA_DIR=/app/data` → `site.json`, `media-index.json`
- uploads → `public/uploads` (or `UPLOADS_DIR`); Next also serves via `GET /uploads/[name]` if static snapshot is stale

Зробіть backup `data/site.json` і `public/uploads` регулярно.

### Env checklist

- [ ] `ADMIN_PASSWORD` — сильний, не `changeme`
- [ ] `SESSION_SECRET` — довгий random (напр. `openssl rand -hex 32`)
- [ ] SMTP для production (інакше заявки лише в логи)
- [ ] `SITE_URL` — **публічний** https URL (sitemap.xml, Open Graph / WhatsApp). Не `localhost`. Приклад: `https://beyou.properservice.keenetic.pro`. Після зміни — рестарт і повторний шеринг (кеш месенджера).
- [ ] `NODE_ENV=production` (в образі вже)

### Health

- HTTP: nginx → Next `:3000`
- Admin: `/admin/login`
- Contact: submit form, check mailbox or container logs

## Local production build (без Docker)

```bash
npm ci
npm run seed
npm run build
npm start
```

Потрібен `output: 'standalone'` (вже в `next.config.ts`).

### Windows: pm2 + автозапуск (без Docker)

Один раз (потрібен Node.js в PATH, готовий `.env`):

```bash
npm run pm2:setup
```

Що робить `pm2:setup`:

1. Ставить залежності, якщо немає `node_modules`
2. `npm run build` **лише якщо** немає `.next/BUILD_ID`
3. Запускає додаток через **pm2** (`ecosystem.config.cjs`, слухає `0.0.0.0` + `PORT` з `.env`)
4. `pm2 save` + автозавантаження Windows (`pm2-windows-startup` або Task Scheduler → `pm2 resurrect`)

| Команда | Дія |
|---------|-----|
| `npm run pm2:setup` | install/start + autostart |
| `npm run update` | git pull + always-build + `pm2 restart byou` |
| `npm run pm2:logs` | логи |
| `npm run pm2:restart` | рестарт процесу (без pull/build) |
| `npm run pm2:stop` | стоп |
| `npm run start:prod` | foreground без pm2 (build-if-needed) |

Після змін у коді на хості **не** робіть голий `git pull` + `pm2 restart`. `pm2:setup` / `start:prod` збирають **лише якщо** немає `.next/BUILD_ID`, тому старий бандл залишиться. Один крок:

```bash
npm run update
```

Якщо сайт «голий» (HTML є, стилів/JS немає) і в Network у CSS/JS статус **400** або type **html**:

1. Зробіть повний rebuild + restart (`npm run update`, або `docker compose up -d --build`).
2. У браузері: DevTools → Application → Service Workers → **Unregister**, потім hard reload (Ctrl+Shift+R).
3. Перевірте, що `/_next/static/css/*.css` віддає `200` і `Content-Type: text/css`, а не HTML-сторінку помилки.

Service worker (`public/sw.js`) **не** кешує `/_next/*` (з `ps-shell-v4`), щоб після деплою не змішувались старі/нові чанки.

Перевірка: `http://localhost:3000/api/health` (або ваш `PORT`).  
LAN/KeenDNS: firewall inbound TCP на цей порт; `COOKIE_SECURE=false` для HTTP — див. розділ нижче.

## Dev Docker

```bash
npm run docker:dev
# default nginx port often 8080 — see docker-compose.dev.yml
```

## Laptop + Keenetic DNS (LAN)

Типовий сценарій: сайт крутиться на ноутбуці, роутер роздає імʼя через Keen DNS.

1. У `.env`: `COOKIE_SECURE=false` (без HTTPS cookie з `Secure` не збережеться).
2. `docker compose up -d --build` (або `npm run docker:up`).
3. Дізнайтесь LAN IP ноутбука (`ipconfig` / `ip a`).
4. Keenetic: DNS → A-запис (напр. `service.home`) → цей IP; або Cloud / remote access за інструкцією Keenetic.
5. Windows Firewall: дозволити вхідний TCP `NGINX_PORT` (зазвичай 80).
6. Перевірка: `http://<host>/api/health` → `{"ok":true,...}`.
7. Адмінка: `http://<host>/admin` — сильний `ADMIN_PASSWORD` + `SESSION_SECRET`.

Рекомендації безпеки в LAN:

- Не використовуйте `changeme`
- Обмежте `/admin`:
  - `ADMIN_IP_ALLOWLIST=192.168.1.10,127.0.0.1` — лише ці IP (UI + API)
  - або VPN / firewall allowlist / basic auth на nginx
- Регулярний backup `data/site.json`, `data/backups/`, `data/leads.json`, `data/orders.json`, `public/uploads`
- Якщо відкриваєте порт у інтернет — обовʼязково HTTPS (і тоді `COOKIE_SECURE=true`)

## Off-site backup (обовʼязково)

Snapshots у `data/backups/` **на тому ж ноутбуці** не рятують від крадіжки/SSD-crash.

Раз на тиждень (або щодня в Task Scheduler):

```bash
# Windows (приклад): xcopy / robocopy на інший диск
robocopy "C:\path\to\properservice\data" "D:\backups\ps-data" /MIR
robocopy "C:\path\to\properservice\public\uploads" "D:\backups\ps-uploads" /MIR

# або rclone → OneDrive / S3 / SMB
# rclone sync ./data remote:properservice/data
# rclone sync ./public/uploads remote:properservice/uploads
```

Також: Dashboard → Live health показує last backup і підказку off-site.

## Auto-backup

За замовчуванням кожне збереження контенту пише snapshot у `data/backups/` (`AUTO_BACKUP=true`, `BACKUP_KEEP=20`).

### CLI (Task Scheduler / cron на ноутбуці)

```bash
cd properservice
npm run backup
```

**Windows Task Scheduler:** щодня `npm run backup` у каталозі проєкту (або `npx tsx scripts/backup.ts`).

**Linux/macOS cron** (щодня о 03:00):

```cron
0 3 * * * cd /path/to/properservice && npm run backup >> /var/log/ps-backup.log 2>&1
```

### HTTP cron (якщо сайт запущений)

У `.env`: `BACKUP_CRON_SECRET=...` (той самий секрет для ops-alerts)

```bash
curl -X POST -H "Authorization: Bearer $BACKUP_CRON_SECRET" http://localhost/api/backup
# Ops: backup >48h / SMTP missing → Telegram (throttle 12h)
curl -X POST -H "Authorization: Bearer $BACKUP_CRON_SECRET" http://localhost/api/ops-alerts
```

Список snapshot: адмінка → **Налаштування → Backup**. Ops alerts також спрацьовують при відкритті Dashboard (HealthPanel).

## Security notes

1. Не публікуйте `.env`
2. Обмежте доступ до `/admin` (VPN / basic auth на nginx — опційно)
3. PHP mailer можна вимкнути з compose, якщо не використовується
4. Після зміни `SESSION_SECRET` усі сесії інвалідуються
5. Health endpoint: `GET /api/health` (без секретів)

---

## Ноутбук-хост: пошаговая настройка автозапуска (без Docker)

> **Важно:** текущая машина для разработки и ноутбук, где сайт «живёт» 24/7, — разные окружения.  
> Скрипты `pm2:setup` / `start:prod` нужно **установить и запустить на том ноутбуке**, который будет отдавать сайт в LAN / KeenDNS.  
> Docker **не нужен**. Нужны: Windows 10/11, Node.js, копия проекта, `.env`, pm2.

Ниже — полный чеклист «с нуля» только для **хоста**.

### 0. Что должно получиться в итоге

1. Ноутбук включился (или вы вошли в Windows) → сайт сам поднялся.
2. В домашней сети: `http://<имя-или-IP>:3000` открывает сайт.
3. `http://<хост>:3000/api/health` отвечает `{"ok":true,...}`.
4. Админка `/admin` логинится (при HTTP: `COOKIE_SECURE=false`).
5. После обновления кода на хосте: `npm run update` (pull + build + `pm2 restart byou`).

Схема:

```text
[включение / вход в Windows]
        │
        ▼
[Task Scheduler или pm2-windows-startup]
        │  pm2 resurrect
        ▼
[pm2 → byou]
        │  next start -H 0.0.0.0 -p 3000
        ▼
[браузеры в LAN / KeenDNS]
```

### 1. Подготовка Windows на ноутбуке-хосте

1. **Питание и сон** (иначе сайт «пропадёт»):
   - Параметры → Система → Питание:
     - при питании от сети: **сон = Никогда** (или длинный таймаут);
     - по желанию: «Не уходить в спящий режим, когда ноутбук закрыт» (через доп. схемы питания / утилиту производителя).
   - Ноутбук должен быть **включён и в сети**, когда нужен сайт.

2. **Статический LAN IP** (чтобы KeenDNS / DNS-запись не «плыла»):
   - в веб-морде Keenetic: DHCP → резервирование IP по MAC Wi‑Fi/Ethernet ноутбука  
     **или** вручную: Параметры → Сеть → IPv4 → статический адрес в вашей подсети (шлюз = IP роутера).

3. Узнать IP после настройки:

   ```powershell
   ipconfig
   ```

   Запомните IPv4 (например `192.168.1.50`).

### 2. Установка Node.js (только на хосте)

1. Скачайте **Node.js LTS** (20.x или новее): https://nodejs.org/
2. Установщик: галочка **«Add to PATH»**.
3. Откройте **новый** PowerShell и проверьте:

   ```powershell
   node -v
   npm -v
   ```

   Если команды не находятся — перелогиньтесь в Windows или переустановите Node с PATH.

### 3. Скопировать проект на ноутбук-хост

Любой удобный способ (выберите один):

| Способ | Как |
|--------|-----|
| **Git** | `git clone <url> C:\apps\properservice` затем `git checkout <ветка>` |
| **Архив / USB** | скопировать папку проекта **без** обязательного `node_modules` (его поставите на месте) |
| **Сетевой диск** | не рекомендуется как единственная копия (при отвале сети сайт упадёт) |

Рекомендуемый путь без пробелов, если возможно, например:

```text
C:\apps\properservice
```

(Пробелы в `F:\SSD PROJECT\...` обычно работают, но путь без пробелов надёжнее для Task Scheduler.)

**Не копируйте** с dev-машины секреты в git. Файл `.env` перенесите **отдельно** (флешка / вручную), в репозиторий он не коммитится.

Минимально нужные папки/файлы на хосте:

- исходники (`app/`, `lib/`, `public/`, `scripts/`, `package.json`, `package-lock.json`, `ecosystem.config.cjs`, …)
- `data/` (контент `site.json`, leads, orders, backups) — если уже есть боевые данные
- `public/uploads/` — загруженные картинки
- `.env` — секреты и SMTP

### 4. Создать / проверить `.env` на хосте

В корне проекта:

```powershell
cd C:\apps\properservice
copy .env.example .env
notepad .env
```

Обязательно выставьте:

| Переменная | Для хоста без HTTPS (LAN / Keen HTTP) |
|------------|----------------------------------------|
| `ADMIN_PASSWORD` | сильный пароль (не `changeme`) |
| `SESSION_SECRET` | длинная случайная строка (`openssl rand -hex 32` или любой 64-hex) |
| `COOKIE_SECURE` | **`false`** (иначе cookie админки не сохранятся по HTTP) |
| `PORT` | `3000` (или другой свободный) |
| `SITE_URL` | публичный URL, напр. `http://service.home:3000` или `http://192.168.1.50:3000` |
| `SMTP_*` / `MAIL_*` | если нужны заявки на почту |
| `ADMIN_IP_ALLOWLIST` | опционально: IP, с которых можно в `/admin` |

Без Docker переменная `NGINX_PORT` **не используется** — наружу идёт `PORT`.

### 5. Первый запуск на хосте (вручную, проверка)

```powershell
cd C:\apps\properservice
npm install
npm run seed
# seed — только если data/site.json ещё пустой / нужен дефолтный контент

npm run build
npm run start:prod
```

`start:prod` = `scripts/start-prod.ps1`:

- поставит `node_modules`, если их нет;
- соберёт проект, **только если нет** `.next\BUILD_ID`;
- поднимет Next на `0.0.0.0:PORT`.

Проверки **на самом ноутбуке**:

1. Браузер: `http://localhost:3000`
2. `http://localhost:3000/api/health` → ok
3. `http://localhost:3000/admin` → логин

Остановка: `Ctrl+C` в том окне PowerShell.

Проверка **с телефона в той же Wi‑Fi** (пока firewall может мешать — см. шаг 7):

```text
http://192.168.1.50:3000/api/health
```

(подставьте свой IP)

### 6. Автозапуск через pm2 (основной способ)

На **том же** ноутбуке, в каталоге проекта:

```powershell
cd C:\apps\properservice
npm run pm2:setup
```

Скрипт `scripts/pm2-setup.ps1` по шагам:

1. Prepare: deps + build-if-needed (`start-prod.ps1 -PrepareOnly`).
2. `npm install -g pm2` (если pm2 ещё нет).
3. `pm2 start ecosystem.config.cjs` (процесс с именем **`byou`**).
4. `pm2 save` (список процессов для восстановления).
5. Автозагрузка Windows:
   - сначала пробует **`pm2-windows-startup install`**;
   - если не вышло — создаёт задачу Планировщика **`ProperService-pm2`**: при **входе пользователя** → `pm2 resurrect`.

Ожидаемый вывод: `pm2 status` с `byou` = **online**.

Полезные команды (запомните):

```powershell
pm2 status
pm2 logs byou
npm run update
npm run pm2:logs
npm run pm2:restart
npm run pm2:stop
```

#### 6.1. Если `npm run pm2:setup` ругается на PATH / pm2

1. Закройте все окна терминала.
2. Откройте **новый** PowerShell от того же пользователя, под которым работаете каждый день.
3. Проверьте: `pm2 -v`
4. Снова: `cd C:\apps\properservice` → `npm run pm2:setup`

Если `npm install -g pm2` требует права администратора — запустите PowerShell **«от имени администратора»** один раз для глобальной установки, затем setup можно повторить обычным пользователем.

#### 6.2. Проверка автозапуска

`pm2:setup` создаёт:

1. Задачу Планировщика **`ProperService-pm2`** (при входе + 30 с) → `scripts/pm2-autostart.ps1`
2. Ярлык в папке **Автозагрузка** (fallback)
3. Лог: `logs/pm2-autostart.log`

Проверка:

1. `pm2 status` — процесс online.
2. Симуляция без reboot: `npm run pm2:autostart` → снова online, в `logs/pm2-autostart.log` строка `OK`.
3. **Перезагрузите ноутбук** (полный reboot).
4. Войдите в Windows под **тем же пользователем**, под которым делали setup (например `Administrator`).
5. Подождите **1–2 минуты** (delay 30 с + старт).
6. `http://localhost:3000/api/health`

Если не поднялось:

```powershell
cd C:\apps\properservice
type logs\pm2-autostart.log
npm run pm2:autostart
pm2 status
pm2 logs byou --lines 50
```

Проверьте задачу:

```powershell
Get-ScheduledTask -TaskName "ProperService-pm2" | Format-List *
Get-ScheduledTaskInfo -TaskName "ProperService-pm2"
# LastTaskResult: 0 = OK
```

Планировщик заданий (GUI):

1. `Win + R` → `taskschd.msc` → Enter  
2. Библиотека планировщика → задача **`ProperService-pm2`**  
3. Триггер: «При входе в систему», задержка 30 секунд  
4. Действие: `powershell.exe ... -File "...\scripts\pm2-autostart.ps1"`  
5. История: включить «Журнал всех заданий» при отладке  

**Частые причины «после reboot нет сайта»:**

| Причина | Что сделать |
|---------|-------------|
| Не вошли в учётку (экран входа) | Войти тем же user, что делал setup; или настроить автологин Windows |
| Setup делали от Admin, а входите под другим user | setup + `pm2 save` **под тем user, под которым работаете** |
| Задача не создана / LastTaskResult ≠ 0 | setup **от имени администратора**, смотреть `logs\pm2-autostart.log` |
| Только `pm2 resurrect` без PATH | новый setup: autostart-скрипт сам добавляет Node в PATH |
| Сон ноутбука | отключить сон при питании от сети |

#### 6.3. Ручная задача Планировщика (если setup не создал)

1. `taskschd.msc` → Создать задачу…  
2. Имя: `ProperService-pm2`  
3. Триггер: **При входе в систему** (ваш пользователь), задержка 30 секунд.  
4. Действие → Запуск программы:
   - Программа: `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`
   - Аргументы: `-NoProfile -ExecutionPolicy Bypass -File "C:\apps\properservice\scripts\pm2-autostart.ps1"`
   - «Рабочая папка»: `C:\apps\properservice`  
5. Условия: снять «Запускать только при питании от электросети».  
6. Параметры: при сбое — перезапуск через 1 минуту.  
7. На вкладке «Общие»: «Выполнять с наивысшими правами».

Перед этим один раз вручную:

```powershell
cd C:\apps\properservice
pm2 start ecosystem.config.cjs
pm2 save
npm run pm2:autostart
```

### 7. Windows Firewall (доступ из LAN)

От **администратора** PowerShell (порт = ваш `PORT`, обычно 3000):

```powershell
New-NetFirewallRule -DisplayName "ProperService Next.js" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
```

Или GUI: Брандмауэр Windows → Дополнительные параметры → Правила для входящих → Создать правило → Порт → TCP 3000 → Разрешить.

Проверка с другого устройства в той же сети:

```text
http://<LAN-IP-ноутбука>:3000/api/health
```

### 8. KeenDNS / DNS Keenetic (доступ по имени)

#### Только домашняя сеть (рекомендуется)

1. Keenetic → DNS / доменные имена (название пункта зависит от прошивки).
2. A-запись, например `service.home` → **статический IP ноутбука**.
3. Клиенты должны брать DNS с роутера (обычно так по DHCP).
4. Открыть: `http://service.home:3000`  
   (порт **нужен** в URL, если это не 80).

В `.env` на хосте:

```env
SITE_URL=http://service.home:3000
COOKIE_SECURE=false
```

После смены `.env`:

```powershell
npm run pm2:restart
```

#### Доступ из интернета (KeenDNS cloud / проброс портов)

Только если осознанно нужно:

1. Проброс на Keenetic: внешний TCP (80/443/3000) → `LAN-IP-ноутбука:3000`.
2. Сильный `ADMIN_PASSWORD`, желательно `ADMIN_IP_ALLOWLIST` или VPN.
3. Без HTTPS трафик и cookie видны; для публичной сети лучше TLS и тогда `COOKIE_SECURE=true`.

### 9. Обновление сайта на хосте (после правок на dev)

Dev-машина **не** запускает prod-pm2. На хосте **одна** команда:

```powershell
cd C:\apps\properservice
npm run update
```

Что делает `scripts/update-app.ps1`:

1. Копия `data/*.json` → `data/backups/pre-update-<время>/` (живой CMS не теряется без следа).
2. `git fetch` + `git pull --ff-only` текущей ветки. Отказ, если дерево грязное или нужен merge.
3. `npm ci`, только если изменились `package.json` / lockfile (или нет `node_modules`).
4. **Всегда** `npm run build` (иначе `.next` останется старым).
5. `pm2 restart byou` (имя процесса одно: **`byou`**). Если Windows залочил `.next`, скрипт коротко стопает pm2 и собирает снова.
6. Проверка `http://127.0.0.1:<PORT>/api/health`.

Флаги: `npm run update -- -SkipPull` (только build+restart), `-SkipBackup`, `-SkipHealth`.

Почему не `git pull` + `pm2 restart`: авто-сборка в `pm2:setup` / `start:prod` срабатывает **только если нет** `.next\BUILD_ID`. Без `npm run build` будет крутиться **старый** код.

На хосте:

- не запускайте `npm run seed` (перезапишет `data/site.json`);
- не force-pull и не правьте код локально — только pull с dev;
- секреты и uploads не в git (`.env`, `public/uploads`).

Проверка после обновления: `/api/health` + главная + админка.

### 10. Бэкапы на хосте (обязательно)

Контент живёт в файлах:

- `data/site.json`, `data/leads.json`, `data/orders.json`, `data/backups/`
- `public/uploads/`

Раз в день/неделю — копия **на другой диск** (не только тот же SSD):

```powershell
robocopy "C:\apps\properservice\data" "D:\backups\ps-data" /MIR
robocopy "C:\apps\properservice\public\uploads" "D:\backups\ps-uploads" /MIR
```

Отдельная задача Планировщика: ежедневно `npm run backup` в каталоге проекта (snapshots в `data/backups/`) **плюс** robocopy off-site.

### 11. Типовые проблемы

| Симптом | Что проверить |
|---------|----------------|
| После reboot сайта нет | Вошли ли в Windows тем же user? `pm2 resurrect`, задача `ProperService-pm2` |
| `pm2` not found | Node/npm PATH; новый терминал; `npm install -g pm2` |
| С телефона не открывается | Firewall, IP ноутбука, `0.0.0.0` (ecosystem уже с `-H 0.0.0.0`), одна ли подсеть |
| Админка «разлогинивает» | `COOKIE_SECURE=false` при HTTP; перезапуск pm2 после правки `.env` |
| Старый дизайн/код после pull | Забыли `npm run update` (нужен `npm run build` перед `pm2:restart`) |
| Ноут «уснул» | Питание / сон (шаг 1) |
| Порт занят | `netstat -ano \| findstr :3000` или сменить `PORT` в `.env` и `pm2 delete` + `npm run pm2:setup` |

### 12. Быстрый чеклист «хост готов»

- [ ] Node.js LTS в PATH (`node -v`, `npm -v`)
- [ ] Проект лежит на диске хоста (например `C:\apps\properservice`)
- [ ] `.env` с сильными секретами, `COOKIE_SECURE=false`, `PORT=3000`, `SITE_URL=...`
- [ ] `npm install` + `npm run build` успешны
- [ ] `npm run pm2:setup` → `pm2 status` = online
- [ ] После **перезагрузки** health снова ok
- [ ] Firewall TCP 3000
- [ ] DHCP reservation / статический IP
- [ ] Keenetic A-запись (если нужно имя)
- [ ] robocopy / backup на другой диск
- [ ] Питание: не уходить в сон, когда сайт должен быть доступен

### 13. Чего **не** делать на dev-машине

| Dev (эта машина) | Хост (ноутбук с сайтом) |
|------------------|-------------------------|
| `npm run dev`, правки кода, тесты | `npm run pm2:setup`, автозапуск |
| Можно не ставить pm2 | pm2 обязателен для auto-restart |
| Docker — по желанию | Docker не нужен для этого сценария |
| `.env` dev | отдельный `.env` prod/LAN |

Итоговая команда **только на ноутбуке-хосте** после клонирования и настройки `.env`:

```powershell
cd C:\apps\properservice
npm install
npm run pm2:setup
```

Дальше — reboot-тест, firewall, KeenDNS (шаги 6–8).
