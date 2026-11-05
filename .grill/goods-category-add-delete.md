# Grill: goods category add and delete
Date: 2026-10-19

## Intent
Add and delete goods categories from the admin chip row. A new category can exist before any product is in it. Deleting a category moves its goods into «Інше».

## Constraints
- The cross is the only delete. «Усі» and «Інше» have no cross.
- Delete confirms, then stays dirty until «Зберегти всі».
- Empty categories survive until the cross, including after the last product leaves.
- Name rules are the same on +, rename, the product dropdown, bulk category, and CSV: no blank, no «Інше», no «Усі», no case-insensitive duplicate, max 120 characters.
- The Livesta import is unchanged.

## Key decisions
- Decision: persist named categories on the catalog, separate from product strings. Reason: a chip with zero products cannot be derived from products. Alternative considered: create the category only by opening a new product.
- Decision: show an empty group in «Групи» on the unfiltered list and when its chip is selected. Reason: «Перейменувати» lives on the group header. Alternative considered: a pencil on the chip, or no rename until a product exists.
- Decision: after delete, jump to «Інше» only when that chip was active and goods moved; an empty delete returns to «Усі». Reason: the operator should see moved goods, and should not be dropped into the large default bucket when nothing moved.
- Decision: «Перейменувати» to «Інше» is refused. Reason: that path currently moves goods without the delete confirm. Alternative considered: reuse the confirm, or leave the unguarded rename.
- Decision: after + succeeds, select the new chip. Reason: the empty group must be visible immediately.
- Decision: feed import does not file goods and does not drop empty categories. Reason: new feed products have no category today, and existing categories must stick.

## Surfaced assumptions
- Categories are an admin catalog tool. The public shop keeps listing only categories that have a visible product.
- Bulk-applying «Інше» moves products and leaves the source category in place.
- Renaming onto an existing name merges into that chip.
- Chips that already differ only by case stay until someone renames or deletes them.
- Production UI is `components/admin/GoodsEditor.tsx`. The `features/goods-editor` copy is not mounted.

## Out of scope
- Auto-classifying «Інше» or new feed goods.
- Manual category order.
- Delete controls on the storefront or on the group header.
- Immediate save, or a confirm that requires typing the name.

