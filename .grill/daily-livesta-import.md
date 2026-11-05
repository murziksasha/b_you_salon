# Daily Livesta import, stop and continue

## Intent

An in-app daily import of goods from the Livesta feed, with Stop and Continue on the goods screen. Manual import stays available while the schedule is stopped.

## Constraints

- Due at 04:00 Europe/Kyiv. No time picker. No Windows Task Scheduler.
- One successful scheduled day per Kyiv date. A later restart does not import again.
- If the process was down at 04:00 while the schedule was enabled and today has not succeeded, the next tick catch-up-imports once.
- Continue only re-arms the job. It does not import now. If Continue is pressed after 04:00, the next run is tomorrow at 04:00.
- Failures retry every 15 minutes until one save succeeds, while the schedule stays enabled.
- Stop cancels an in-progress scheduled run before the catalog is written, and cancels further retries.
- «Імпортувати зараз» works while stopped, keeps the dialog URL and photo checkbox, and does not turn the schedule on.
- A manual success after 04:00 while the schedule is enabled stamps today so retries stop. A manual success before 04:00 leaves the morning job in place.
- Scheduled runs do not download images. Existing `/uploads/` photos stay. New SKUs keep the remote image URL.
- Missing feed SKUs stay in the catalog as they are.
- Existing rows keep `inStock`. New rows start in stock. «Залишок» in characteristics still updates. Manual and scheduled imports share this rule.
- New SKUs stay hidden, with no category. Category, sort pin, related products, and visibility of existing rows stay.
- Ships stopped. Schedule URL is editable on Товари, prefilled with `https://livesta.ua/index.php?route=api/products`. Dialog URL is independent.
- Editor role, the same role that can import today.
- One activity line when a Kyiv day's failures start, one when a run saves. Last error on Товари. No Telegram or email. Retries do not add more journal rows.

## Key decisions

- Decision: Stop freezes the daily schedule. Reason: the feed re-imports by SKU and saves only at the end, so a mid-catalog checkpoint is unused. Alternative considered: resume from the last SKU.
- Decision: Continue waits until the next 04:00. Reason: a deliberate pause must not catch up. Alternative considered: Continue imports immediately.
- Decision: one success per Kyiv day. Reason: deploys and PM2 reloads must not re-import. Alternative considered: import on every process start.
- Decision: retry every 15 minutes until success. Reason: a single 04:00 failure would skip the day. Alternative considered: one attempt, or three attempts then auto-stop.
- Decision: same merge as today, plus keep `inStock` on existing rows. Reason: the feed has no stock flag; forcing `inStock: true` puts manually unavailable creams back on sale. Alternative considered: always force in stock, or map quantity 0 to out of stock.
- Decision: scheduled run leaves photos alone. Reason: a nightly re-download would replace hand-set `/uploads/` files. Alternative considered: download new SKUs only, or re-download every photo.
- Decision: leave SKUs that disappeared from the feed. Reason: the salon may still sell remaining stock. Alternative considered: hide or delete them.
- Decision: ship stopped with an editable URL on Товари. Reason: the night of deploy must not import, and the feed address can change without a release. Alternative considered: URL fixed in code, or already running.

## Surfaced assumptions

- The app stays up under PM2 (`instances: 1`, fork), so an in-process loop matches `startScheduledPublishLoop` in `instrumentation.ts`.
- The goods screen that matters is `components/admin/GoodsEditor.tsx` via `app/admin/goods/page.tsx`. The copy under `features/goods-editor/` is not mounted.
- Quantity from Livesta is display text in characteristics, not the catalog `inStock` flag.
- A manual import and a scheduled import must not write `goods` at the same time. The second caller waits or gets a clear "already running" response.

## Out of scope

- Mid-feed resume, deleting or hiding SKUs missing from the feed, a time picker, Telegram or email alerts, downloading originals on the schedule, Windows Task Scheduler, and editing `features/goods-editor/`.

---

## Implementation

### Schedule record

Add `data/feed-schedule.json` (gitignored via `/data/*.json`). Atomic write, same helper as the rest of `data/`.

```ts
type FeedSchedule = {
  enabled: boolean;
  url: string;
  lastSuccessDate: string | null; // YYYY-MM-DD Europe/Kyiv
  lastSuccessAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  failureNotifiedDate: string | null;
  skipDate: string | null; // Kyiv date to refuse catch-up
  nextAttemptAt: string | null;
};
```

Default: `enabled: false`, URL `https://livesta.ua/index.php?route=api/products`, other fields null.

### Due rule (pure, tested)

`lib/feed-schedule.ts` takes `now` and the record.

A scheduled run is due when all of these hold:

- `enabled`
- Kyiv clock time is at or after 04:00
- `lastSuccessDate` is not today's Kyiv date
- `skipDate` is not today's Kyiv date
- `nextAttemptAt` is null or already passed

Continue (`enabled: true`):

- Before 04:00 Kyiv: clear `skipDate`. Today's 04:00 still runs.
- At or after 04:00 Kyiv: set `skipDate` to today. Next due time is tomorrow 04:00.

Stop (`enabled: false`): set `enabled` false and abort the in-memory scheduled run before `saveSiteData`. Leave `lastSuccessDate` unchanged.

### Runner

`lib/feed-schedule-runner.ts`, started from `instrumentation.ts` next to the publish loop. Guard with `globalThis`, `unref` the timer, tick about every 30 seconds. Skip under `VITEST` and `NEXT_PHASE=phase-production-build`, same as the other loops.

On a due tick, if the shared import lock is free, run the shared importer with `downloadImages: false` and an abort signal. On success: set `lastSuccessDate`, `lastSuccessAt`, clear `lastError` and `nextAttemptAt`, append one activity line (`actor` omitted or `schedule`). On failure: set `lastError`, `lastErrorAt`, `nextAttemptAt = now + 15 minutes`. Append activity only when `failureNotifiedDate` is not today, then set it. On abort before save: write nothing to the catalog and do not stamp success.

The runner calls the library directly. It does not hit `POST /api/import-feed`, so the 5-per-5-minutes rate limit stays on the human route.

### Shared import

Move the merge loop out of `app/api/import-feed/route.ts` into `lib/run-feed-import.ts`.

- Match by SKU as today.
- On update, keep `id`, `category`, `sortPin`, `relatedIds`, `visible`, and `inStock`.
- On create, `visible: false`, `inStock: true`, no category.
- Check the abort signal between batches and immediately before save. Abort skips the save.
- One in-process lock. If the lock is held, the HTTP route returns 409 with a Ukrainian message. The runner skips the tick without recording a failure.
- After a manual HTTP success: if the schedule is enabled, Kyiv time is at or after 04:00, and `skipDate` is not today, stamp `lastSuccessDate` so retries stop.

### API and UI

`GET` and `PUT /api/import-feed/schedule`, `requireAdminRole('editor')`.

PUT body: `{ enabled?: boolean, url?: string }`. URL rules match the importer (`http(s)`, max 600). Enabling runs the Continue rule above. Disabling runs Stop, including abort.

On `components/admin/GoodsEditor.tsx`, a strip beside the existing feed controls:

- Stopped or armed
- Next run (today 04:00, a retry time, or tomorrow 04:00)
- Last success or last error in red
- Stop / Continue
- Schedule URL field, save without importing

The import dialog stays as it is, including the photo checkbox and its own URL.

### Tests

- Due, skip-after-Continue, retry backoff, once-per-day, catch-up only when enabled and not skipped. Inject `now`.
- Update keeps `inStock: false`; create sets `inStock: true`. Adjust `app/api/import-feed/route.test.ts`, which currently expects `inStock: true` on the updated row.
- Abort before save does not call through to a catalog write.
- Manual success after 04:00 stamps the day; manual success before 04:00 does not.

### Verify

Unit tests above. Then, with the dev server, open Адмінка → Товари as an editor: the strip loads stopped, saving the URL round-trips, Continue and Stop change the status, and the import dialog still opens. Do not run a full Livesta import against the real catalog. Say so if the browser pass cannot log in.

