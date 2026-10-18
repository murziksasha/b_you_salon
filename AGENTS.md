# B_You

Marketing site for the B_You beauty studio: salon on the right, cosmetics shop on the left, one domain, one admin. File CMS. No database, no online payment, no slot calendar.

Stack: Next.js 15 App Router, React 19, TypeScript (`strict`, `verbatimModuleSyntax`), Sass, Zod, Vitest, Playwright. Dev server: `npm run dev` (port 3001).

## Commands

- `npm run typecheck` — `tsc --noEmit`
- `npm run lint` — ESLint
- `npm test` — Vitest. Scope with `npx vitest run lib/<module>.test.ts`
- `npm run test:smoke` — Playwright smoke. Full e2e: `npm run test:e2e`
- `npm run build` — production build. Use after routing, config, or shared-layout changes.

Shell is Windows PowerShell. Chain commands with `;`, not `&&`.

## Layout

- `app/` — routes and Route Handlers (`app/api/**/route.ts`)
- `components/` — shared UI. `features/<slice>/` — vertical slices (ui + model)
- `lib/` — domain logic, Zod, file I/O. Tests sit beside the module: `lib/<module>.test.ts`
- `styles/` and `src/sass/` — global SCSS. No CSS Modules
- `data/` — JSON journals. `public/uploads/` — media. Do not edit these unless the task is about that content
- Deeper map: `docs/architecture.md`, product rules: `docs/SPECS.md`

## Conventions

- Code, comments, and technical docs in English. Public and admin UI strings in Ukrainian.
- Named exports. Props typed. Type-only imports use `import type`. Path alias `@/*`.
- Icons: named imports from `lucide-react`.
- Client preferences: `localStorage` keys `byou-theme` and `byou-cookie-consent`. Admin does not use the public theme switch or cookie banner.
- CMS HTML goes through `sanitizeHtml()` before `dangerouslySetInnerHTML`. JSON-LD and the theme/cookie boot scripts are not CMS HTML.
- Validate request bodies and parsed files with Zod.

## Persistence

Single-instance file CMS. Writes go through `atomicWriteFile` / `atomicWriteJson` (`lib/atomic-write.ts`) inside `withFileMutex` (`lib/file-mutex.ts`). Temp file, then rename.

`PUT /api/site` is an optimistic lock on `SiteData.updatedAt`. A stale client revision returns **409**.

Auth: timing-safe password, HMAC cookie `admin_session`, optional TOTP. Gate admin APIs with `require-role.ts`. Do not read, print, or commit `.env` or session secrets.

## Product boundaries

Zones stay separate: `home` | `salon` | `shop`.

- Home does not sell. Services live on `/salon*`. Goods live on `/shop*`.
- Cart icon only in the shop zone (`/shop`, `/store`, `/cart`), even when the cart count is above zero.
- Salon CTA is booking (`POST /api/contact`, lead `source: booking`). Shop CTA is an order or a consult (`POST /api/orders`, `source: shop|consult`).
- Prices on orders are taken on the server. `inStock === false` rejects the line.

## Verify

Run the checks that match the edit: a co-located Vitest file for `lib/` logic, `npm run typecheck` when types move, lint on touched files. Do not sweep the whole suite on every small iteration.

For a UI, layout, or routing change, exercise the affected public and admin flow in the browser (desktop and, when layout changed, mobile). Shared state must still match on the other routes that read it: cart, theme, cookie consent, site save.
