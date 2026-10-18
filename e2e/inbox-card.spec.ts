import { expect, test, type Page } from '@playwright/test';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'e2e-test-password';

async function loginAdmin(page: Page) {
  await page.goto('/admin/login');
  await page.fill('#admin-password', ADMIN_PASSWORD);
  await page.getByRole('button', { name: /увійти/i }).click();
  await expect(page).toHaveURL(/\/admin\/?$/, { timeout: 15_000 });
}

async function seedInboxLead(page: Page, phone: string) {
  const res = await page.request.post('/api/contact', {
    data: { phone, pagePath: '/salon', source: 'callback' },
  });
  expect(res.ok()).toBeTruthy();
}

test.describe.serial('inbox card', () => {
  test('quick statuses, callback field, templates, operator telegram', async ({ page }) => {
    await loginAdmin(page);
    await seedInboxLead(page, '+380631110001');
    await seedInboxLead(page, '+380631110002');

    await page.goto('/admin/inbox');
    await expect(page.locator('h1')).toHaveText(/inbox/i);
    await page.getByRole('button', { name: 'Відкриті' }).click();
    await expect(page.getByRole('heading', { name: /заявка|замовлення/i }).first()).toBeVisible({
      timeout: 15_000,
    });

    await expect(page.getByText('Результат закриття (outcome)')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Готово' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Не взяв' })).toBeVisible();

    const statusSelect = page.locator('label.admin-field', { hasText: 'Статус' }).locator('select');
    const datetime = page.locator('input[type="datetime-local"]');
    const note = page.locator('label.admin-field', { hasText: 'Нотатка' }).locator('textarea');
    await expect(datetime).toBeVisible();
    await expect(note).toBeVisible();

    const dtBorder = await datetime.evaluate((el) => getComputedStyle(el).borderTopWidth);
    const selBorder = await statusSelect.evaluate((el) => getComputedStyle(el).borderTopWidth);
    expect(Number.parseFloat(dtBorder)).toBeGreaterThanOrEqual(1);
    expect(Number.parseFloat(selBorder)).toBeGreaterThanOrEqual(1);

    await expect(page.getByRole('button', { name: 'Привітання' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Передзвонимо пізніше' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Копіювати' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Viber' })).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Telegram' })).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'SMS' })).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Vb' })).toHaveCount(0);

    const viberHref = await page.getByRole('link', { name: 'Viber' }).getAttribute('href');
    expect(viberHref).toMatch(/^viber:\/\/chat\?number=/);
    const tgHref = await page.getByRole('link', { name: 'Telegram' }).getAttribute('href');
    expect(tgHref).toMatch(/^https:\/\/t\.me\/share\/url\?/);
    expect(tgHref).not.toContain('url=&');
    expect(tgHref).toContain('text=');

    const opTg = page.getByRole('button', { name: /надіслати операторам у telegram/i });
    const tgOff = page.getByText('TG off');
    await expect(opTg.or(tgOff).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Telegram ↗' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Не взяв' }).click();
    await expect(page.locator('.admin-wf-badge', { hasText: 'Не взяв' }).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText('Оберіть результат закриття')).toHaveCount(0);

    await page.getByRole('button', { name: 'Готово' }).click();
    await expect(page.getByText('Оберіть результат закриття')).toHaveCount(0);

    await page.getByRole('button', { name: 'Усі' }).click();
    await expect(page.getByRole('heading', { name: /заявка|замовлення/i }).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator('.admin-wf-badge', { hasText: 'Готово' }).first()).toBeVisible();
    await expect(page.getByText('Домовленість / запис').first()).toBeVisible();
    await expect(page.locator('label.admin-field', { hasText: 'Уточнити результат' })).toBeVisible();

    await statusSelect.selectOption('waiting');
    await expect(page.locator('.admin-wf-badge', { hasText: 'Очікує' }).first()).toBeVisible({
      timeout: 10_000,
    });

    // Two-step delete (no window.confirm) must work even after focusing the note field
    const phoneBefore = (await page.locator('.admin-inbox-detail .admin-lead-phone').textContent())?.trim();
    expect(phoneBefore).toBeTruthy();
    await note.click();
    await page.getByRole('button', { name: 'Видалити' }).click();
    await expect(page.getByRole('button', { name: 'Підтвердити видалення' })).toBeVisible();
    await page.getByRole('button', { name: 'Підтвердити видалення' }).click();
    await expect(page.getByText('Видалено')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.admin-inbox-detail .admin-lead-phone')).not.toHaveText(phoneBefore!, {
      timeout: 10_000,
    });
  });

  test('inbox card wraps on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAdmin(page);
    await seedInboxLead(page, '+380631110003');
    await page.goto('/admin/inbox');
    await expect(page.getByRole('button', { name: 'Готово' })).toBeVisible({ timeout: 15_000 });
    const box = await page.locator('.admin-inbox-detail').boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeLessThanOrEqual(390);
  });
});
