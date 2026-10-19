# PWA install on one KeenDNS HTTPS origin

## Intent

Clients install B_You from the public site onto Android, Windows, and iPhone. The icon opens the live site in its own window. The notebook must be awake. The owner can also open `/admin` from that same installed window, from any network, with a password plus that user's own TOTP.

## Constraints

- Install means a live-site shortcut. Offline catalog, a separate staff app, and store listings are out.
- One origin for everyone, including inside the studio: `https://beyou.properservice.keenetic.pro`. `COOKIE_SECURE=true`. `SITE_URL` is that HTTPS name.
- `http://service.home:3000` is not the install address and not the login address.
- Admin stays on `/admin` of that same origin. The owner may use it from mobile data.
- On the notebook host: `ADMIN_ENV_LOGIN=off` and `ADMIN_REQUIRE_TOTP=true`. Login is refused unless that `admins.json` user has a personal TOTP secret. A global `ADMIN_TOTP_SECRET` does not count. Every login-capable user needs their own TOTP before the flag is turned on.
- Break-glass still works: `ADMIN_ENV_LOGIN=breakglass` plus `ADMIN_BREAKGLASS=1`, with the existing audit and Telegram alert. A missing personal secret does not block break-glass. If a global secret is also configured, that code is still required.
- A dismissible install hint on public pages only. It waits until `data-cookie-banner=done`. Chrome and Edge also wait for `beforeinstallprompt`. iPhone shows Share → Add to Home Screen steps. Dismissal is stored on the device. The hint hides when the site is already running standalone. It sits above the sticky call bar.
- Next.js keeps listening on port 3000. Keenetic publishes HTTPS on the 4th-level name and forwards to that port.

## Key decisions

- Decision: single origin for both public PWA and admin. Reason: simplifies routing, eliminates cross-origin storage issues, and uses a single valid Let's Encrypt certificate managed by Keenetic. Alternative considered: separate admin domain.
- Decision: generate dedicated 192x192 and 512x512 PNG icons using sharp from `logo.jpg` with `purpose: "any"`. Reason: Chromium requires genuine PNG icons at standard sizes and fails when combined with invalid maskable declarations. Alternative considered: keep JPEG or SVG.
- Decision: fix service worker precache list and bump cache key to `ps-shell-v5`. Reason: precaching missing `/img/icons/logo.png` halts service worker installation completely.
- Decision: install hint waits for cookie consent and suppresses on `/admin` or in standalone mode. Reason: avoid UI collisions with consent banner and mobile sticky call bar; staff in `/admin` don't need visitor install prompts.
- Decision: strict personal TOTP enforcement on host (`ADMIN_REQUIRE_TOTP=true`) while preserving break-glass escape hatch. Reason: ensures each operator is audited with individual credentials and not dependent on shared `.env` secret.

## Surfaced assumptions

- KeeneticOS is 2.15 or newer with 4th-level domain certificate active and port mapping to host port 3000.
- Notebook host stays awake (sleep disabled on AC power).
- Studio Wi-Fi supports NAT loopback / hairpinning to the HTTPS KeenDNS name, or router resolves local DNS for the name.

## Out of scope

- Offline catalog caching or offline shopping cart.
- App store listings (Google Play TWA, Microsoft Store package, Apple App Store).
- Native push notifications.
- Changing Next.js server port from 3000.

