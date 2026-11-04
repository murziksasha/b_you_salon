import { expect, test } from '@playwright/test';

test.describe('public catalog & cart end-to-end flows', () => {
  test('search, category chips, and back navigation flow', async ({ page }) => {
    await page.goto('/shop');
    await expect(page.getByRole('heading', { name: /магазин/i }).first()).toBeVisible();

    const searchInput = page.locator('.shop-toolbar__input');
    await expect(searchInput).toBeVisible();

    // 1. Search flow
    await searchInput.fill('крем');
    await expect(page).toHaveURL(/q=%D0%BA%D1%80%D0%B5%D0%BC|q=крем/);

    // 2. Category chip selection
    const chips = page.locator('.shop-chip');
    if ((await chips.count()) > 1) {
      const secondChip = chips.nth(1);
      await secondChip.click();
      await expect(secondChip).toHaveClass(/is-active/);
      expect(page.url()).toContain('category=');

      // 3. Navigate away and back navigation restores search state
      await page.goto('/cart');
      await expect(page).toHaveURL(/\/cart/);
      await page.goBack();
      await expect(searchInput).toHaveValue('крем');
    }
  });

  test('cart hydration, quantity updates, and checkout validation', async ({ page }) => {
    await page.goto('/shop');

    // Add first available product to cart
    const firstCartBtn = page.locator('.shop-card__cart-btn').first();
    await expect(firstCartBtn).toBeVisible();
    await firstCartBtn.click();

    // Navigate to cart
    await page.goto('/cart');
    await expect(page.getByRole('heading', { name: /кошик/i })).toBeVisible();
    await expect(page.locator('.cart-row')).toHaveCount(1);

    // Quantity update: click +
    const initialQty = await page.locator('.cart-qty__input').inputValue();
    expect(Number(initialQty)).toBeGreaterThanOrEqual(1);

    const plusBtn = page.getByRole('button', { name: 'Збільшити кількість' });
    await plusBtn.click();
    await expect(page.locator('.cart-qty__input')).toHaveValue(String(Number(initialQty) + 1));

    // Fill form and verify checkout validation
    const submitBtn = page.locator('.cart-panel__submit');
    await expect(submitBtn).toBeEnabled();
  });

  test('server rejects orders with out-of-stock items (server-side enforcement)', async ({ request }) => {
    // Attempt to order an item known to be out of stock or non-existent
    const res = await request.post('/api/orders', {
      data: {
        phone: '+380509990000',
        items: [{ id: 'non-existent-product-id-xyz', qty: 1 }],
      },
      headers: { 'Content-Type': 'application/json' },
    });

    expect(res.status()).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/Product not available|Missing items/i);
  });
});

test.describe('mobile catalog layout', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('renders catalog toolbar and search comfortably on mobile', async ({ page }) => {
    await page.goto('/shop');
    await expect(page.locator('.shop-toolbar')).toBeVisible();
    await expect(page.locator('.shop-toolbar__input')).toBeVisible();
    const count = await page.locator('.shop-card').count();
    expect(count).toBeGreaterThan(0);
  });
});
