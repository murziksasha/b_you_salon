import { describe, expect, it } from 'vitest';
import { shouldSendTelegramPush } from './telegram-notify-policy';

const inbox = [
  { id: 'l1', phone: '+380671234512', open: true },
  { id: 'o1', phone: '+380501112233', open: false },
];

describe('telegram-notify-policy', () => {
  it('sends the first open item for a phone', () => {
    expect(
      shouldSendTelegramPush({
        kind: 'lead',
        phone: '+380671234512',
        newId: 'l1',
        inbox,
        quiet: false,
      }),
    ).toEqual({ send: true });
  });

  it('skips a repeat while the same phone is still open', () => {
    expect(
      shouldSendTelegramPush({
        kind: 'order',
        phone: '0671234512',
        newId: 'o2',
        inbox: [...inbox, { id: 'o2', phone: '+380671234512', open: true }],
        quiet: false,
      }),
    ).toEqual({ send: false, reason: 'open-phone' });
  });

  it('sends again after the previous item is closed', () => {
    expect(
      shouldSendTelegramPush({
        kind: 'lead',
        phone: '+380671234512',
        newId: 'l2',
        inbox: [
          { id: 'l1', phone: '+380671234512', open: false },
          { id: 'l2', phone: '+380671234512', open: true },
        ],
        quiet: false,
      }),
    ).toEqual({ send: true });
  });

  it('skips contact dedup even when newId is the existing row', () => {
    expect(
      shouldSendTelegramPush({
        kind: 'lead',
        phone: '+380671234512',
        newId: 'l1',
        inbox,
        quiet: false,
        deduped: true,
      }),
    ).toEqual({ send: false, reason: 'open-phone' });
  });

  it('skips lead/order during quiet hours; ops is not this function’s quiet path', () => {
    expect(shouldSendTelegramPush({ kind: 'lead', phone: '+38067', quiet: true })).toEqual({
      send: false,
      reason: 'quiet',
    });
    expect(shouldSendTelegramPush({ kind: 'ops', quiet: true })).toEqual({ send: true });
  });
});
