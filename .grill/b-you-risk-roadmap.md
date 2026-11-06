# Grill: B_You risk and roadmap review
Date: 2026-11-04

## Intent
Revise the live site's improvement plan around data integrity, admin access, and then shop speed. Keep one production release with a short planned interruption.

## Constraints
- Windows laptop with pm2 and KeenDNS remains the host for about one year.
- Keep the file CMS; no database, online payment, slot calendar, or new external integrations.
- Target two weeks of nearly full-time work, but delay the single release if acceptance fails; no emergency patch release.
- Keep the current off-site backup implementation. The desired recovery point is 24 hours and recovery time is one working day, but neither is verified by a restore drill.
- Remote admin access must work from outside the studio. Personal 2FA is required for the owner only; other accounts keep their current policy.

## Key decisions
- Ship one combined release. Reason: avoid frequent production interruptions. Alternative considered: a separate security patch; rejected.
- Remove the Telegram "claim work" mutation because operators do not use it. Preserve notification and search behavior.
- Show 36 products initially, append further batches, use a flat result list and category filters. Preserve full-description search on the server. Include the cart in payload reduction.
- Remove the 500-record caps. Delete closed leads and orders from working JSON 12 months after closure; preserve open records. Existing off-site copies have a separate lifetime.
- Enable the 12-month order deletion without an accountant's confirmation. Reason: owner choice after the legal risk was explained. Alternative considered: retain or archive orders until classification; rejected.
- Add product features only when a current problem or measurable outcome is established. No other product problem was identified beyond shop speed.

## Surfaced assumptions
- The original catalog size estimate is stale: 1,334 goods serialize to about 2.86 MB, with about 2.24 MB of descriptions; the cart also receives the full catalog.
- The production Telegram mode is unknown; the plan must protect both webhook and long-poll operation.
- A local trusted reverse proxy was not confirmed. Default plan: no new proxy; use conservative non-IP abuse limits and record their availability tradeoff.
- The existing backup script does not establish a verified 24-hour recovery point or one-day restore time.

## Out of scope
- New paid or free third-party integrations, including Nova Poshta, GA4, Plausible, and SMS/Viber confirmations.
- New salon time fields, order-number/callback-time UI, and other unproven product features.
- Broad component/API refactors, SQLite, ISR, global clone removal, nonce CSP, and a hosting migration unless required to fix a selected risk.
