# features/ (FSD)

Each feature exposes a public API via `features/<name>/index.ts`; import only `@/features/<name>`
(enforced by ESLint `no-restricted-imports`).

## Migration status

| Feature | Status |
|---|---|
| `page-constructor` | Migrated. `components/admin/PageConstructor.tsx` removed. `PageDiffRevisions`, `PagePreviewPanel`, `SectionFieldEditors` are extracted pieces not wired yet (stage 10). |
| `goods-editor` | **Pending manual merge.** The split version (`GoodsEditor` + `GoodsBulkBar` + `ProductEditCard`) predates later fixes in `components/admin/GoodsEditor.tsx` (e.g. `d9a7e26`). Production still uses `components/admin/GoodsEditor.tsx`. |
| `media-library` | **Pending manual merge.** `MediaLibrary` / `MediaPicker` differ from `components/admin/*` (~150 lines). Production still uses `components/admin/*`. |

Empty 0-byte stubs (admin-auth, cart-checkout, callback-lead, catalog-filter, cookie-consent,
quick-order, theme-switcher, totp-setup) were removed; CI fails on new empty files in `features/`.
