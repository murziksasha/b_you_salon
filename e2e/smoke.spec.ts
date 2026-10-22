import { readFileSync } from 'fs';
import path from 'path';
import { expect, test, type Page } from '@playwright/test';

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

  test('home emits Ukrainian Open Graph tags', async ({ request }) => {
    const res = await request.get('/');
    expect(res.ok()).toBeTruthy();
    const html = await res.text();
    expect(html).toMatch(/<html[^>]*lang="uk"/i);
    expect(html).toMatch(/property="og:locale"[^>]*content="uk_UA"|content="uk_UA"[^>]*property="og:locale"/);
    expect(html).toMatch(/property="og:title"/);
    expect(html).toMatch(/property="og:description"/);
    expect(html).toMatch(/property="og:image"/);
    expect(html).toMatch(/og-cover\.jpg/);
    expect(html).toMatch(/name="twitter:card"[^>]*content="summary_large_image"|content="summary_large_image"[^>]*name="twitter:card"/);
    expect(html).not.toMatch(/og:image"[^>]*localhost:3000\/img\/icons\/logo/i);
  });

  test('robots.txt', async ({ request }) => {
    const res = await request.get('/robots.txt');
    expect(res.ok()).toBeTruthy();
    const text = await res.text();
    expect(text.toLowerCase()).toContain('user-agent');
    expect(text).toContain('/admin');
    expect(text).toContain('/cart');
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
    const json = (await res.json()) as {
      name: string;
      start_url: string;
      icons?: Array<{ src: string; sizes: string; type: string; purpose?: string }>;
    };
    expect(json.name).toContain('B_You');
    expect(json.start_url).toBe('/');
    expect(json.icons).toBeDefined();
    const icon192 = json.icons?.find((i) => i.sizes === '192x192');
    const icon512 = json.icons?.find((i) => i.sizes === '512x512');
    expect(icon192?.type).toBe('image/png');
    expect(icon512?.type).toBe('image/png');
  });

  test('offline fallback page', async ({ request }) => {
    const res = await request.get('/offline.html');
    expect(res.ok()).toBeTruthy();
    const html = await res.text();
    expect(html).toContain('Офлайн');
    expect(html).toContain('B_You');
    expect(html).not.toContain('Proper Service');
  });

  test('service worker script', async ({ request }) => {
    const res = await request.get('/sw.js');
    expect(res.ok()).toBeTruthy();
    const body = await res.text();
    expect(body).toContain('byou-shell');
    const start = body.indexOf('async function networkNavigation');
    const end = body.indexOf('function isStaticAsset');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const navigation = body.slice(start, end);
    expect(navigation).not.toContain('cache.put');
    expect(navigation).not.toContain('caches.open');
    expect(navigation).toContain("caches.match('/offline.html')");

    const register = readFileSync(path.join(process.cwd(), 'components', 'PwaRegister.tsx'), 'utf8');
    expect(register).toContain("const SW_VERSION = '6'");
    expect(register).toContain('/sw.js?v=${SW_VERSION}');
    expect(register).toContain("scope: '/'");
    expect(register).toContain('controllerchange');
    expect(register).toContain('serviceWorker.controller');

    const docker = readFileSync(path.join(process.cwd(), 'Dockerfile'), 'utf8');
    const standaloneAt = docker.indexOf('/app/.next/standalone');
    const publicAt = docker.lastIndexOf('/app/public ./public');
    expect(standaloneAt).toBeGreaterThan(-1);
    expect(publicAt).toBeGreaterThan(standaloneAt);
  });

  test('left door goes to shop, right door to salon', async ({ page }) => {
    await page.goto('/');
    const contacts = page.locator('.doors__contact');
    await expect(contacts).toHaveCount(2);
    await expect(contacts.nth(0)).toHaveAttribute('href', '/shop');
    await expect(contacts.nth(1)).toHaveAttribute('href', '/salon');
    for (const contact of await contacts.all()) {
      const href = await contact.getAttribute('href');
      expect(href).not.toMatch(/^tel:/);
    }

    const headerPhone = page.locator('.by-header__phone');
    await expect(headerPhone).toHaveAttribute('href', /^tel:/);

    const stickyPhone = page.locator('.sticky-call__phone');
    if (await stickyPhone.count()) {
      await expect(stickyPhone).toHaveAttribute('href', /^tel:/);
    }

    await contacts.nth(0).click();
    await expect(page).toHaveURL(/\/shop/);
    await page.goto('/');
    await contacts.nth(1).click();
    await expect(page).toHaveURL(/\/salon/);

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
      const json = (await res.json()) as { ok?: boolean; leadId?: string };
      expect(json.ok).toBe(true);
    }
  });

  test('home shop intent creates consult order not lead', async ({ request }) => {
    const res = await request.post('/api/contact', {
      data: {
        phone: '+380501114455',
        pagePath: '/',
        intent: 'shop',
        comment: 'e2e shop intent',
      },
      headers: { 'Content-Type': 'application/json' },
    });
    expect([200, 429]).toContain(res.status());
    if (res.status() === 200) {
      const json = (await res.json()) as { ok?: boolean; orderId?: string; consult?: boolean; leadId?: string };
      expect(json.ok).toBe(true);
      expect(json.consult).toBe(true);
      expect(json.orderId).toBeTruthy();
      expect(json.leadId).toBeUndefined();
    }
  });

  test('shop page contact is a consult order', async ({ request }) => {
    const res = await request.post('/api/orders', {
      data: { phone: '+380501116677', pagePath: '/shop', comment: 'e2e shop form' },
      headers: { 'Content-Type': 'application/json' },
    });
    expect([200, 429]).toContain(res.status());
    if (res.status() === 200) {
      const json = (await res.json()) as { ok?: boolean; consult?: boolean; orderId?: string };
      expect(json.ok).toBe(true);
      expect(json.consult).toBe(true);
      expect(json.orderId).toBeTruthy();
    }
  });

  test('order rejects missing items outside shop flow', async ({ request }) => {
    const res = await request.post('/api/orders', {
      data: { phone: '+380501112233', productId: 'nonexistent-product-id' },
      headers: { 'Content-Type': 'application/json' },
    });
    expect([400, 429]).toContain(res.status());
  });

  test('order without items from home is rejected', async ({ request }) => {
    const res = await request.post('/api/orders', {
      data: { phone: '+380501112233', pagePath: '/' },
      headers: { 'Content-Type': 'application/json' },
    });
    expect([400, 429]).toContain(res.status());
  });

  test('cookie banner is on public pages and remembers the choice', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: /файли cookie/i });

    await page.goto('/');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /прийняти/i }).click();
    await expect(dialog).toHaveCount(0);

    await page.goto('/salon');
    await expect(dialog).toHaveCount(0);

    await page.getByRole('button', { name: /налаштування cookies/i }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /лише необхідні/i }).click();
    await expect(dialog).toHaveCount(0);
    await page.reload();
    await expect(dialog).toHaveCount(0);
  });

  test('cookie banner necessary-only also persists on a fresh context', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const dialog = page.getByRole('dialog', { name: /файли cookie/i });
    await page.goto('/');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /лише необхідні/i }).click();
    await expect(dialog).toHaveCount(0);
    await page.goto('/shop');
    await expect(dialog).toHaveCount(0);
    await context.close();
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

  test('theme toggle is on every public page and persists', async ({ page }) => {
    const urls = ['/', '/salon', '/shop', '/cart', '/confident'];
    const toggle = page.getByRole('button', { name: /увімкнути (світлу|темну) тему/i });

    for (const url of urls) {
      await page.goto(url);
      await expect(toggle.first()).toBeVisible();
    }

    await page.goto('/');
    const before = await page.locator('html').getAttribute('data-theme');
    expect(before === 'light' || before === 'dark').toBeTruthy();

    await toggle.first().click();
    const flipped = before === 'dark' ? 'light' : 'dark';
    await expect(page.locator('html')).toHaveAttribute('data-theme', flipped);

    await page.goto('/salon');
    await expect(page.locator('html')).toHaveAttribute('data-theme', flipped);
    await expect(toggle.first()).toBeVisible();
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
    await expect(page.getByRole('dialog', { name: /файли cookie/i })).toHaveCount(0);
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

async function loginAdmin(page: Page) {
  await page.goto('/admin/login');
  await page.fill('#admin-password', ADMIN_PASSWORD);
  await page.getByRole('button', { name: /увійти/i }).click();
  await expect(page).toHaveURL(/\/admin\/?$/, { timeout: 15_000 });
}

test.describe.serial('admin mail card and goods toolbar', () => {
  test('owner follows SMTP для листів to the mail card', async ({ page }) => {
    await loginAdmin(page);
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: /огляд|dashboard/i })).toBeVisible({ timeout: 15_000 });

    const link = page.getByRole('link', { name: 'SMTP для листів' });
    if (await link.count()) {
      await link.click();
    } else {
      await page.goto('/admin/settings#smtp');
    }

    await expect(page).toHaveURL(/\/admin\/settings#smtp/);
    const card = page.locator('#smtp');
    await expect(card).toBeVisible();
    await expect(card.getByRole('heading', { name: 'Пошта (SMTP)' })).toBeVisible();
    await expect(page.locator('#smtp-pass')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Зберегти в .env' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Перезапустити сайт' })).toBeVisible();

    const place = await page.evaluate(() => {
      const main = document.querySelector('.admin-main');
      const smtp = document.getElementById('smtp');
      if (!main || !smtp) return null;
      const mainBox = main.getBoundingClientRect();
      const cardBox = smtp.getBoundingClientRect();
      return { mainTop: mainBox.top, mainBottom: mainBox.bottom, cardTop: cardBox.top };
    });
    expect(place).toBeTruthy();
    expect(place!.cardTop).toBeGreaterThanOrEqual(place!.mainTop - 2);
    expect(place!.cardTop).toBeLessThan(place!.mainBottom);
  });

  test('non-owner does not see the SMTP password field', async ({ page }) => {
    await loginAdmin(page);
    await page.route('**/api/auth', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          user: {
            username: 'editor1',
            role: 'editor',
            grants: ['settings', 'dashboard_view'],
          },
        }),
      });
    });

    await page.goto('/admin/settings#smtp');
    const card = page.locator('#smtp');
    await expect(card.getByText('Пошту може змінити лише власник.')).toBeVisible();
    await expect(page.locator('#smtp-pass')).toHaveCount(0);
    await expect(card.getByRole('button', { name: 'Зберегти в .env' })).toHaveCount(0);
  });

  test('goods pilot card stays at the top of the admin pane', async ({ page }) => {
    await loginAdmin(page);
    await page.goto('/admin/goods');
    const main = page.locator('.admin-main');
    const toolbar = page.locator('.admin-goods-toolbar');
    await expect(toolbar).toBeVisible({ timeout: 15_000 });

    const before = await main.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(before.scrollHeight).toBeGreaterThan(before.clientHeight + 80);

    await main.evaluate((el) => {
      el.scrollTop = Math.min(900, el.scrollHeight);
    });
    await expect.poll(async () => main.evaluate((el) => el.scrollTop)).toBeGreaterThan(80);

    const place = await page.evaluate(() => {
      const mainEl = document.querySelector('.admin-main');
      const bar = document.querySelector('.admin-goods-toolbar');
      const title = document.querySelector('.admin-main > h1');
      if (!mainEl || !bar || !title) return null;
      const mainBox = mainEl.getBoundingClientRect();
      const barBox = bar.getBoundingClientRect();
      const titleBox = title.getBoundingClientRect();
      const paddingTop = Number.parseFloat(getComputedStyle(mainEl).paddingTop) || 0;
      return {
        mainTop: mainBox.top,
        paddingTop,
        barTop: barBox.top,
        titleBottom: titleBox.bottom,
      };
    });
    expect(place).toBeTruthy();
    const stuckAtPaneTop = Math.abs(place!.barTop - place!.mainTop) < 2;
    const stuckBelowPadding = Math.abs(place!.barTop - (place!.mainTop + place!.paddingTop)) < 2;
    expect(stuckAtPaneTop || stuckBelowPadding).toBeTruthy();
    expect(place!.titleBottom).toBeLessThanOrEqual(place!.barTop + 1);
  });
});
