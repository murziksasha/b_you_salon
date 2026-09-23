# Agent Profile: Minimalist & B_You Super Feat Guidelines

## Core Principles

- **No Fillers:** Skip "Sure," "I can help," or "As an AI."
- **Directness:** Start answers immediately. No intros/outros.
- **Precision:** Use fewest words possible.
- **Formatting:** Use lists and bolding. No walls of text.
- **UTF-8 Only:** Force **UTF-8** encoding for all file outputs/TSX writes; strictly avoid UTF-16.
- **Language:** All code, comments, and technical documentation in **English**. UI strings follow project specs (Ukrainian).

## Response Style

- **Code:** Only code, no code explanation unless requested.
- **Facts:** Single-sentence bullets.
- **Opinion:** Only if prompted, then brief.
- **Correction:** Fix and provide result. No apologies.
- **No Emojis:** Do not include any emojis anywhere in responses.

## Token Saving Rules

1. Use contractions (it's, don't).
2. Avoid repeating user prompt.
3. Use markdown symbols (e.g., "->" instead of "leads to").
4. Core logic first for complex tasks.
5. Follow the **Decomposer** principle: split tasks into atomic changes (< 50 LOC) with `[D]` for dependencies and `[T]` for tests.

## Build Discipline & Anti-Loop Rules

- If build fails, fix it directly without entering infinite repair loops.
- **Circuit Breaker:** Max 2 automated fix attempts per failure. If an edit introduces syntax or parse errors twice, halt immediately, revert corrupted edits to git HEAD, and report instead of looping.
- **No Polling Timers:** Never use `schedule` or timer loops to wait for background commands. Stop calling tools and wait for reactive system wakeup.
- **Sync Command Execution:** Set `WaitMsBeforeAsync: 10000` on verification commands to avoid backgrounding.
- **Scoped Verification:** Run targeted checks on modified packages/paths (`npm run typecheck`, `npm test -- <path>`), not root sweeps during iterations.
- **Atomic Writes on Windows:** On Windows CRLF environments, prefer `write_to_file` over chained partial-line edits on large TSX files to avoid line duplication.
- Don't stop at reporting errors; install missing deps and resolve TS/Vite issues before final response.
- **Verification Offloading:** Delegate post-implementation test, lint, and fix cycles to a subagent to save main context tokens.

## Subagent Delegation

- **Test & Lint Fixes:** Delegate all post-implementation test/lint runs and iterative error resolution to a subagent.
- **Deep Research:** Use research subagents for large-scale codebase exploration or heavy documentation lookups.
- **Compact Reporting:** Subagent returns only high-level status, modified files, and test results -> main agent continues without log pollution.

---

## Tech Stack & Conventions

### Frontend

- **Framework:** Next.js 15 (App Router), React 19.
- **Styling:** SCSS (`sass`), CSS Modules, and global utility classes in `styles/`.
- **Icons:** `lucide-react` (named imports).
- **State Management:** React state, URL search params (`useSearchParams`), and native `localStorage` for client preferences (`byou-theme`, `byou-cookie-consent`).
- **Component Pattern:** Named exports with explicit typed props (`export function Component(props: Props)` or `export const Component: React.FC<Props> = ...`).
- **Type Imports:** Always use `import type` for type-only imports (`verbatimModuleSyntax: true`).
- **Sanitization:** All CMS HTML strings pass through `sanitizeHtml()` before `dangerouslySetInnerHTML`.

### Backend

- **Runtime:** Node.js Next.js Route Handlers (`app/api/**/route.ts`).
- **Persistence:** File-based CMS storing JSON in `data/` (`site.json`, `leads.json`, `orders.json`, `media-index.json`).
- **Atomic I/O:** All file writes MUST use `lib/atomic-write.ts` and `lib/file-mutex.ts` (write to temp file then rename).
- **Validation:** Zod schemas (`zod`) for all incoming payloads and data model parsing.
- **Authentication:** Timing-safe password verification, HMAC-signed session cookies (`admin_session`), optional TOTP 2FA (`qrcode`, `lib/totp.ts`).
- **Image Processing:** `sharp` for automatic JPEG -> WebP conversion, dimension clamping, and preset optimization.
- **Notifications:** `nodemailer` for SMTP mail, Telegram Bot API for internal operator queue.
- **Error Handling:** Centralized error structures and typed responses with HTTP status codes.

---

## Architecture: Domain-Driven (Backend)

### Module Structure

Each backend domain module in `lib/` follows:

- **Types & Schemas:** Strict TypeScript interfaces and Zod schemas in `lib/types.ts` or `<domain>.ts`.
- **Pure Logic:** Deterministic business logic, filtering, and calculation functions separated from I/O.
- **Data Access:** File persistence wrapped with `atomicWriteFile` and file mutex locks.
- **Route Handlers:** `app/api/<domain>/route.ts` validating requests, checking sessions/roles via `require-role.ts`, and invoking domain logic.
- **Testing:** Co-located or parallel unit tests named `<module>.test.ts` executed via Vitest.

---

## B_You Super Feat Rules (Core Invariants)

### 1. The Strict Dual-Zone Rule (Non-Mixing)

- **Left Door (`/shop`, `/store`, `/cart`):** Cosmetics shop (Iryna). Product catalog, cart, product consultation requests.
- **Right Door (`/salon`):** Beauty salon (Natalia). Services catalog, booking requests.
- **Home Page (`/`):** Never sells directly. Contains `doors-hero` and contacts with zone intent selector.
- **Cart Badge Isolation:** Cart icon is strictly visible ONLY in shop zone (`/shop`, `/store`, `/cart`). Permanently hidden on `/` and `/salon`.
- **CTA Conventions:**
  - Salon: Gold pill button (`border-radius: 999px`) labeled "Записатись" -> smooth-scrolls to `#callback`.
  - Shop: "Консультація" -> smooth-scrolls to `#contacts` (or `/shop#contacts` from cart) or "До кошика".
- **Anchor Offset:** `#callback` and `#contacts` MUST retain `scroll-margin-top: calc(6.4rem + 2.4rem)` to clear sticky header.
- **Mobile Drawer:** Any link, CTA, backdrop, or close button click must trigger an animated drawer close.

### 2. Smart Form Flow & Routing

- **Salon Booking:** `/salon*` or `intent=salon` -> `POST /api/contact` -> `data/leads.json` (source: `booking` | `callback`) -> Telegram "Запис".
- **Shop Orders & Consultations:** `/shop*`, `/cart`, or `intent=shop` -> `POST /api/orders` -> `data/orders.json` (source: `shop` | `consult`) -> Telegram "Продаж".
- **Phone Formatting:** Ukrainian mask `+38 (___) ___ __ __` (`lib/phone.ts`).
- **Phone Privacy:** Always mask phones in Telegram and logs as `+38067***12`. Full number revealed only via copy button or `/find` in authenticated sessions.

### 3. Atomic Persistence & Concurrency

- **Single Source of Truth:** `data/site.json` holds all content (`SiteData`).
- **Atomic Writes:** Never use raw `fs.writeFileSync` on data files. Always use `lib/atomic-write.ts` with `lib/file-mutex.ts`.
- **Optimistic Concurrency:** `SiteData.updatedAt` must be verified. Return `409 Conflict` if client revision is stale.
- **Separate Journal Files:**
  - `data/leads.json` for callbacks/bookings.
  - `data/orders.json` for shop orders/consultations.
  - `data/media-index.json` for media metadata and folder structures.
  - `data/telegram-subscribers.json` for authorized Telegram operators.
  - `data/admin-totp.json` for 2FA secrets.

### 4. Operator Telegram Bot & Privacy

- **Internal Queue Only:** Bot username is never public. Unauthorized users receive "Немає доступу."
- **Pairing:** Requires single-use pairing code generated from `/admin/ops` (requires `telegram` role).
- **No `tel:` Links:** Telegram does not support `tel:`. Use "Копіювати номер" button or HMAC Viber redirect.
- **Viber Redirect:** `GET /r/viber?p={digits}&s={hmac}` redirects to `viber://chat?number=%2B...` bypassing admin IP-allowlists safely.
- **Bot Permissions:** Operators can only claim ("Взяти в роботу") with 2-step confirmation. Closing (`done`), rejecting (`spam`), or deleting must be done inside the Admin UI.
- **Quiet Hours & Digests:** 22:00-08:00 (Europe/Kyiv) suppress normal pushes. Automated morning, evening, and catch-up digests.

### 5. UI Isolation, Theme & Cookie Consent

- **Admin Isolation:** 100dvh viewport-locked desk with independent scroll (`admin-main`). Never mounts public theme switcher.
- **Public Theme Switcher:** `light` / `dark` via `ThemeProvider` (`html[data-theme]`, key `byou-theme`).
- **Cookie Consent:** Sticky bottom banner (`z-index: 110`). Dual persistence in `localStorage` and 1-year cookie (`v1.all` / `v1.necessary`). Works with or without JavaScript (`POST /api/cookie-consent` fallback).
- **CSP:** Strict in production (`script-src 'self' 'unsafe-inline'`). `'unsafe-eval'` allowed only in `next dev`.

### 6. Media Engine & Presets

- **Sharp Processing:** Uploads (`POST /api/upload`) convert JPEG -> WebP, keep PNG transparency, and clamp dimensions.
- **Presets (`lib/image-presets.ts`):**
  - `default`: 1920x1920 inside
  - `product`: 1200x900 inside
  - `logo`: 512x512 inside
  - `hero`: 1920x1080 inside
  - `og`: 1200x630 inside
- **Deletion Safety:** Verify `lib/media-usage.ts` before deletion. Block deletion if asset is referenced in products, sections, or settings.

---

## Testing & Verification

- **Unit Tests:** Vitest (`npm test`). Co-locate tests as `*.test.ts(x)` next to source.
- **Coverage:** Aim for 100% on business logic helpers in `lib/`.
- **Smoke Tests:** Playwright (`npm run test:smoke`). Run after routing, public layout, or auth changes.
- **Type Checking:** `npm run typecheck` must pass with zero errors.
