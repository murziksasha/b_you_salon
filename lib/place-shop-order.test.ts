import { describe, expect, it, vi } from 'vitest';
import * as ordersModule from './orders';
import { placeShopOrder } from './place-shop-order';

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: vi.fn().mockResolvedValue({ messageId: 'test-msg-id' }),
    })),
  },
}));

vi.mock('./telegram-auto-notify', () => ({
  autoNotifyNewOrder: vi.fn().mockResolvedValue(false),
}));

describe('placeShopOrder write-first persistence', () => {
  it('does not send mail and returns null order if appendOrder fails', async () => {
    const appendSpy = vi.spyOn(ordersModule, 'appendOrder').mockRejectedValueOnce(new Error('Disk write error'));

    const res = await placeShopOrder({
      phone: '+380501112233',
      consult: true,
    });

    expect(appendSpy).toHaveBeenCalledTimes(1);
    expect(res.order).toBeNull();
    expect(res.emailed).toBe(false);
  });

  it('persists order first before returning', async () => {
    const mockOrder: ordersModule.Order = {
      id: 'order-123',
      createdAt: new Date().toISOString(),
      phone: '+380501112233',
      items: [],
      handled: false,
      emailed: false,
      source: 'consult',
      product: { id: 'p1', title: 'Test Product', price: 100 },
      quantity: 1,
    };
    vi.spyOn(ordersModule, 'appendOrder').mockResolvedValueOnce(mockOrder);

    const res = await placeShopOrder({
      phone: '+380501112233',
      consult: true,
    });

    expect(res.order).not.toBeNull();
    expect(res.order?.id).toBe('order-123');
  });
});

