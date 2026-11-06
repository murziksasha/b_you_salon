# B_You Record Retention & Archival Policy

## 1. Statutory Context & Classification

This document establishes the data retention and purge rules for the B_You platform in compliance with Ukrainian legislation (Ukraine Tax Code Art. 44.3–44.4 and the Law of Ukraine "On Personal Data Protection").

### 1.1 Record Types

| Record Type | Journal | Statutory Classification | Retention Period | Start Date Trigger | Automated Purge |
|---|---|---|---|---|---|
| **Salon Leads** | `data/leads.json` | Transient customer inquiries / service bookings | 12 calendar months | `handledAt` for closed; `createdAt` for spam | **Enabled** (via daily runner) |
| **Shop Orders** | `data/orders.json` | Commercial transactions / primary tax accounting documents | 1,095 days min (Art. 44.3 TCU) | Tax reporting period filing deadline | **DISABLED** (Statutory Hold) |

---

## 2. Retention Rules by Record State

### 2.1 Salon Leads (`lib/leads.ts`)
- **Closed (`done`):** Retained for 12 calendar months from `handledAt`. Purged once cutoff date has elapsed.
- **Spam (`spam`):** Retained for 12 calendar months from `handledAt` (or `createdAt` if undated).
- **Active / Unresolved (`new`, `called`, `waiting`, `in_progress`):** **Never purged.** Retained indefinitely until an operator acts on them.
- **Unreachable (`no_answer`):** **Never purged automatically.** Retained for operator re-engagement.
- **Undated legacy records:** **Never purged automatically.** Retained for manual operator review.
- **Reopened leads:** Once reopened (`status: in_progress`), the closed state and timestamp are superseded; the lead is exempt from purge.

### 2.2 Shop Orders (`lib/orders.ts`)
- **Statutory Protection:** Shop orders record monetary transactions, item delivery, and customer obligations. Under TCU Art. 44.3, primary documents must be retained for at least 1,095 days from the date of the relevant tax declaration.
- **Automated Purge State:** **Strictly Disabled.** `purgeExpiredOrders()` returns zero deletions and logs a retention hold status. Order archival or destruction requires manual accountant authorization and export reconciliation.

---

## 3. Concrete Example Scenarios

1. **Completed Salon Lead (13 months old with `handledAt`):**
   - Action: Purged by daily retention runner.
2. **Salon Lead marked `spam` (14 months old with `createdAt`):**
   - Action: Purged by daily retention runner.
3. **Salon Lead marked `no_answer` (14 months old):**
   - Action: **Retained.** Operator may re-engage customer.
4. **Salon Lead marked `done` without `handledAt` (Legacy):**
   - Action: **Retained.** Flagged as `undatedLegacy` for review.
5. **Completed Shop Order (14 months old):**
   - Action: **Retained.** Protected under tax code requirement.
6. **Shop Order with `spam` or canceled status:**
   - Action: **Retained.** Order journal mutations are frozen under statutory hold.
7. **Disputed or Reopened Order/Lead:**
   - Action: **Retained.** Active operational state precludes retention purge.

