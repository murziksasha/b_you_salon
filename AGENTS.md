# B_You — Agent Guidelines

Two parts: **Agent behavior** (how to work) and **Project rules** (what the code must follow).

Marketing site for the B_You beauty studio: salon on the right, cosmetics shop on the left, one domain, one admin. File CMS. No database, no online payment, no slot calendar.

Stack: Next.js 15 App Router, React 19, TypeScript (`strict`, `verbatimModuleSyntax`), Sass, Zod, Vitest, Playwright. Dev server: `npm run dev` (port 3001).
Shell is Windows PowerShell. Chain commands with `;`, not `&&`.

# Part 1 — Agent behavior

## Core Principles

- **No Fillers:** Skip "Sure," "I can help," or "As an AI."
- **Directness:** Start answers immediately. No intros/outros.
- **Precision:** Use fewest words possible.
- **Formatting:** Use lists and bolding. No walls of text.
- **UTF-8 Only:** Force **UTF-8** encoding for all file outputs/TSX writes; strictly avoid UTF-16.
- **Language:** All code, comments, and technical documentation in **English**. Public and admin UI strings in Ukrainian.

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
- **Scoped Verification:** Run targeted checks on modified packages/paths (`npm run typecheck`, `npm test -- <path>`), not root sweeps during iterations.
- **Large TSX on Windows (CRLF):** prefer whole-file writes over chained partial-line edits to avoid line duplication.
- Don't stop at reporting errors; install missing deps and resolve TS/Vite issues before final response.
- **Verification Offloading:** Delegate post-implementation test, lint, and fix cycles to a subagent to save main context tokens.

## Subagent Delegation

- **Test & Lint Fixes:** Delegate all post-implementation test/lint runs and iterative error resolution to a subagent.
- **Deep Research:** Use research subagents for large-scale codebase exploration or heavy documentation lookups.
- **Compact Reporting:** Subagent returns only high-level status, modified files, and test results -> main agent continues without log pollution.

---

# Part 2 — Project rules

## Tech Stack & Conventions

### Frontend

- **Framework:** Next.js 15 (App Router), React 19.
- **Styling:** Global SCSS in `styles/` and `src/sass/`. **No CSS Modules** (repo has zero `*.module.css/scss`).
- **Icons:** `lucide-react` (named imports).
- **State Management:** React state, URL search params (`useSearchParams`), and native `localStorage` for client preferences (`byou-theme`, `byou-cookie-consent`).
- **Admin Preferences:** Admin does not use the public theme switch or cookie banner.
- **Admin scroll:** Only `.admin-main` scrolls. On `/admin/goods`, `.admin-goods-toolbar` (save, import, search, filters) is `position: sticky; top: 0; z-index: 30` with an opaque `var(--admin-surface)` background. The page title may scroll away. Other admin toolbars stay in normal document flow.
- **Component Pattern:** Named exports with explicit typed props (`export function Component(props: Props)` or `export const Component: React.FC<Props> = ...`). Path alias `@/*`.
- **Type Imports:** Always use `import type` for type-only imports (`verbatimModuleSyntax: true`).
- **Sanitization:** All CMS HTML strings pass through `sanitizeHtml()` before `dangerouslySetInnerHTML`. JSON-LD and the theme/cookie boot scripts are not CMS HTML.

### Backend

- **Runtime:** Node.js Next.js Route Handlers (`app/api/**/route.ts`).
- **Persistence:** Single-instance file-based CMS storing JSON in `data/` (`site.json`, `leads.json`, `orders.json`, `media-index.json`). Writes go through `atomicWriteFile` / `atomicWriteJson` (`lib/atomic-write.ts`) inside `withFileMutex` (`lib/file-mutex.ts`). Temp file, then rename.
- **Optimistic Locking:** `PUT /api/site` is an optimistic lock on `SiteData.updatedAt`. A stale client revision returns **409**.
- **Validation:** Zod schemas (`zod`) for all incoming payloads and data model parsing. Validate request bodies and parsed files with Zod.
- **Authentication:** Timing-safe password verification, HMAC-signed session cookies (`admin_session`), optional TOTP 2FA (`qrcode`, `lib/totp.ts`). Gate admin APIs with `require-role.ts`. Do not read, print, or commit `.env` or session secrets.
- **Image Processing:** `sharp` for automatic JPEG -> WebP conversion, dimension clamping, and preset optimization.
- **Notifications:** `nodemailer` for SMTP mail, Telegram Bot API for internal operator queue.
- **Error Handling:** Centralized error structures and typed responses with HTTP status codes.

---

## Product boundaries

Zones stay separate: `home` | `salon` | `shop`.

- Home does not sell. Services live on `/salon*`. Goods live on `/shop*`.
- Cart icon only in the shop zone (`/shop`, `/store`, `/cart`), even when the cart count is above zero.
- Salon CTA is booking (`POST /api/contact`, lead `source: booking`). Shop CTA is an order or a consult (`POST /api/orders`, `source: shop|consult`).
- Prices on orders are taken on the server. `inStock === false` rejects the line.

---

## Layout & Project Map

- `app/` — routes and Route Handlers (`app/api/**/route.ts`).
- `app/admin/*` — admin pages (server components). Every page calls `requirePageAccess('/admin/<x>')` (`lib/admin/page-guard.ts`).
- `app/api/*/route.ts` — API. Admin routes use `withAdmin(cap, zodSchema, fn)` (`lib/api/handler.ts`) or `requireAdminRole(cap)`.
- `components/` — shared UI (`components/admin/*` is the legacy admin UI location).
- `features/<name>/` — FSD features; import only via `@/features/<name>` (see `features/README.md` for migration status).
- `lib/` — domain logic, Zod, file I/O. Tests sit beside the module: `lib/<module>.test.ts`.
- `lib/admin/*` — admin helpers (re-auth, env-login, page guard, save/upload).
- `lib/schemas/*` — Zod schemas for API bodies.
- `styles/` and `src/sass/` — global SCSS. No CSS Modules.
- `data/` — runtime JSON journals (gitignored, never commit; `site.seed.json` is the only tracked file). `public/uploads/` — media. Do not edit these unless the task is about that content.
- Deeper map: `docs/architecture.md`, product rules: `docs/SPECS.md`.

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

## Plan Mode Discipline

- When creating an implementation plan (or in Plan mode):
  - Always create the plan artifact with `RequestFeedback: true`.
  - **Halt immediately** upon creating the plan. Never start executing tasks or editing code automatically.
  - Explicitly ask the user for approval to proceed with the implementation.

---

## Checklist: new admin API route

1. `export const POST = withAdmin('<capability>', Schema, async ({ access, body }) => ...)`.
2. Zod schema in `lib/schemas/<domain>.ts`; errors via `apiError(status, code, message)`.
3. Audit via `safeAudit(...)` (never empty `catch {}`).
4. Sensitive actions: step-up with `verifyCurrentUserPassword(access, password)`.
5. Middleware is deny-by-default: nothing to add unless the route is public (`PUBLIC_API` in `middleware.ts`).
6. Add `route.test.ts`; `tests/api-route-guards.test.ts` fails if a route has no gate.

## Checklist: new admin page

1. `await requirePageAccess('/admin/<x>')` at the top of the page.
2. Add a rule to `NAV_RULES` in `lib/admin-roles.ts`.

---

## Commands

- `npm run check` — typecheck + lint + unit tests (CI runs this).
- `npm run typecheck` — `tsc --noEmit`.
- `npm run lint` — ESLint.
- `npm test` — Vitest. Scope with `npm test -- <path>` or `npx vitest run lib/<module>.test.ts`.
- `npm run test:smoke` — Playwright smoke. Full e2e: `npm run test:e2e`.
- `npm run build` — production build. Use after routing, config, or shared-layout changes.
- `npm run migrate:totp` — per-user 2FA report (dry-run); `-- --apply` makes a backup only.

---

## Verify

Run the checks that match the edit: a co-located Vitest file for `lib/` logic, `npm run typecheck` when types move, lint on touched files. Do not sweep the whole suite on every small iteration.

For a UI, layout, or routing change, exercise the affected public and admin flow in the browser (desktop and, when layout changed, mobile). Shared state must still match on the other routes that read it: cart, theme, cookie consent, site save.

---

## Security env

| Var | Meaning |
|---|---|
| `SESSION_SECRET` | Required in production, >= 32 chars. |
| `ALLOW_LEGACY_SESSION_SECRET` | Temporary: allow weak secret / `ADMIN_PASSWORD` as signing key. |
| `TRUST_PROXY` | `true` behind nginx; `false` when Next.js is exposed directly. |
| `ADMIN_IP_ALLOWLIST` | Optional comma-separated IPs. |
| `ADMIN_ENV_LOGIN` | `always` (default) / `auto` / `breakglass` / `off` — env `ADMIN_PASSWORD` login. |
| `ADMIN_BREAKGLASS` | `1` enables env login in `breakglass` mode (audited + Telegram alert). |
| `ADMIN_CSRF_CHECK` | `false` disables Origin check (debug only). |
