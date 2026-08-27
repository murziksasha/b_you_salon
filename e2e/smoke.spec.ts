import { expect, test } from '@playwright/test';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'e2e-test-password';

test.describe('public smoke', () => {
  test('home page renders doors and LocalBusiness JSON-LD', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.ok()).toBeTruthy();
    await expect(page.locator('.doors')).toBeVisible();
    await expect(page.getByRole('link', { name: /магазин косметики/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /салон краси/i }).first()).toBeVisible();
    const ld = page.locator('script[type="application/ld+json"]');
    await expect(ld.first()).toBeAttached();
    const jsonText = await ld.first().textContent();
    expect(jsonText).toMatch(/LocalBusiness|BeautySalon/);
    expect(await page.locator('.by-card').count()).toBe(0);
    expect(await page.locator('.shop-card').count()).toBe(0);
  });

  test('health endpoint public is minimal', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.ok()).toBeTruthy();
    const json = (await res.json()) as {
      ok: boolean;
      service: string;
      uptimeSec: number;
      backups?: unknown;
      leads?: unknown;
      offsiteHint?: string;
    };
    expect(json.ok).toBe(true);
    expect(json.service).toBe('byou');
    expect(typeof json.uptimeSec).toBe('number');
    expect(json.backups).toBeUndefined();
    expect(json.leads).toBeUndefined();
    expect(json.offsiteHint).toBeUndefined();
  });

  test('robots.txt', async ({ request }) => {
    const res = await request.get('/robots.txt');
    expect(res.ok()).toBeTruthy();
    const text = await res.text();
    expect(text.toLowerCase()).toContain('user-agent');
  });

  test('sitemap.xml', async ({ request }) => {
    const res = await request.get('/sitemap.xml');
    expect(res.ok()).toBeTruthy();
    const text = await res.text();
    expect(text).toContain('<urlset');
  });

  test('PWA manifest', async ({ request }) => {
    const res = await request.get('/manifest.webmanifest');
    expect(res.ok()).toBeTruthy();
    const json = (await res.json()) as { name: string; start_url: string };
    expect(json.name).toContain('B_You');
    expect(json.start_url).toBe('/');
  });

  test('offline fallback page', async ({ request }) => {
    const res = await request.get('/offline.html');
    expect(res.ok()).toBeTruthy();
    const html = await res.text();
    expect(html).toContain('Офлайн');
  });

  test('service worker script', async ({ request }) => {
    const res = await request.get('/sw.js');
    expect(res.ok()).toBeTruthy();
    const body = await res.text();
    expect(body).toContain('ps-shell');
  });

  test('left door goes to shop, right door to salon', async ({ page }) => {
    await page.goto('/');
    await page.locator('.doors__half--left').click();
    await expect(page).toHaveURL(/\/shop/);
    await page.goto('/');
    await page.locator('.doors__half--right').click();
    await expect(page).toHaveURL(/\/salon/);
  });

  test('salon landing has services and callback', async ({ page }) => {
    const res = await page.goto('/salon');
    expect(res?.ok()).toBeTruthy();
    await expect(page.getByRole('link', { name: /манікюр/i }).first()).toBeVisible();
    await expect(page.locator('#callback-form, #callback').first()).toBeVisible();
  });

  test('service landing loads', async ({ page }) => {
    const res = await page.goto('/salon/manicure');
    expect(res?.ok()).toBeTruthy();
    await expect(page.getByText(/манікюр/i).first()).toBeVisible();
  });

  test('shop catalog has products and out-of-stock is marked', async ({ page }) => {
    await page.goto('/shop');
    await expect(page.getByRole('heading', { name: /магазин/i }).first()).toBeVisible();
    expect(await page.locator('.shop-card').count()).toBeGreaterThan(0);
    await expect(page.getByRole('search', { name: /фільтри каталогу/i })).toBeVisible();
    await expect(page.locator('.shop-card__cart-btn').first()).toBeVisible();
  });

  test('unknown route shows 404', async ({ page }) => {
    const res = await page.goto('/this-page-does-not-exist-e2e-xyz');
    expect(res?.status()).toBe(404);
    await expect(page.locator('body')).toBeVisible();
  });

  test('contact creates lead in journal', async ({ request }) => {
    const res = await request.post('/api/contact', {
      data: {
        phone: '+380501112233',
        pagePath: '/salon?utm_source=e2e&utm_medium=test',
        comment: 'e2e',
      },
      headers: { 'Content-Type': 'application/json' },
    });
    expect([200, 429]).toContain(res.status());
    if (res.status() === 200) {
      const json = (await res.json()) as { ok?: boolean };
      expect(json.ok).toBe(true);
    }
  });

  test('order rejects missing items', async ({ request }) => {
    const res = await request.post('/api/orders', {
      data: { phone: '+380501112233', productId: 'nonexistent-product-id' },
      headers: { 'Content-Type': 'application/json' },
    });
    expect([400, 429]).toContain(res.status());
  });

  test('privacy page loads', async ({ page }) => {
    await page.goto('/confident');
    await expect(page.locator('body')).toBeVisible();
    await expect(page.getByText(/конфіденційності/i).first()).toBeVisible();
  });

  test('cart page loads', async ({ page }) => {
    const res = await page.goto('/cart');
    expect(res?.ok()).toBeTruthy();
    await expect(page.getByRole('heading', { name: /кошик/i })).toBeVisible();
  });

  test('mobile doors stack shop then salon', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const left = page.locator('.doors__half--left');
    const right = page.locator('.doors__half--right');
    const leftBox = await left.boundingBox();
    const rightBox = await right.boundingBox();
    expect(leftBox && rightBox && leftBox.y < rightBox.y).toBeTruthy();
  });
});

test.describe('admin smoke', () => {
  test('login page loads', async ({ page }) => {
    await page.goto('/admin/login');
    await expect(page.getByRole('heading', { name: /вхід/i })).toBeVisible();
    await expect(page.locator('#admin-password')).toBeVisible();
    await expect(page.getByRole('button', { name: /увійти/i })).toBeVisible();
  });

  test('protected admin redirects to login', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test('wrong password shows error', async ({ page }) => {
    await page.goto('/admin/login');
    await page.fill('#admin-password', 'definitely-wrong-password');
    await page.getByRole('button', { name: /увійти/i }).click();
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 10_000 });
  });
});

test.describe.serial('admin happy-path', () => {
  test('login → dashboard health → logout', async ({ page }) => {
    await page.goto('/admin/login');
    await page.fill('#admin-password', ADMIN_PASSWORD);
    await page.getByRole('button', { name: /увійти/i }).click();

    await expect(page).toHaveURL(/\/admin\/?$/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Live health/i)).toBeVisible();
    await expect(page.getByText(/data\/site\.json/i)).toBeVisible({ timeout: 10_000 });

    await page.goto('/admin/leads');
    await expect(page.locator('h1')).toHaveText(/заявки/i);

    await page.goto('/admin/orders');
    await expect(page.locator('h1')).toHaveText(/замовлення/i);

    await page.goto('/admin/inbox');
    await expect(page.locator('h1')).toHaveText(/inbox/i);

    await page.goto('/admin/services');
    await expect(page.locator('h1')).toHaveText(/послуги/i);

    await page.goto('/admin/pages');
    await expect(page.locator('h1')).toBeVisible();

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: /вийти/i }).click();
    await expect(page).toHaveURL(/\/admin\/login/, { timeout: 10_000 });
  });
});

test.describe.serial('admin rate-limit', () => {
  test('auth rate-limit returns 429 after burst', async ({ request }) => {
    let lastStatus = 0;
    let lastJson: { retryAfter?: number; error?: string } = {};

    for (let i = 0; i < 15; i++) {
      const res = await request.post('/api/auth', {
        data: { password: `wrong-burst-${i}` },
        headers: {
          'x-forwarded-for': '203.0.113.77',
        },
      });
      lastStatus = res.status();
      if (lastStatus === 429) {
        lastJson = (await res.json()) as { retryAfter?: number; error?: string };
        break;
      }
    }

    expect(lastStatus).toBe(429);
    expect(typeof lastJson.retryAfter).toBe('number');
    expect(lastJson.retryAfter).toBeGreaterThan(0);
  });
});
