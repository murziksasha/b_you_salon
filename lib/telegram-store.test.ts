import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  collectNotifyChatIds,
  consumeTelegramPairing,
  createTelegramPairing,
  generatePairingCode,
  listTelegramSubscribers,
  pairingCodesEqual,
  patchTelegramSubscriber,
  revokeTelegramSubscriber,
  subscriberReceives,
} from './telegram-store';

describe('telegram-store', () => {
  let tmpDir: string;
  let prev: string | undefined;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'byou-tg-'));
    prev = process.env.DATA_DIR;
    process.env.DATA_DIR = tmpDir;
  });

  afterEach(async () => {
    if (prev === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = prev;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('pairing codes compare in a length-safe way', () => {
    expect(pairingCodesEqual('123456', '123456')).toBe(true);
    expect(pairingCodesEqual(' 123456 ', '123456')).toBe(true);
    expect(pairingCodesEqual('123456', '654321')).toBe(false);
    expect(pairingCodesEqual('', '')).toBe(false);
    expect(generatePairingCode()).toMatch(/^\d{6}$/);
  });

  it('creates pairing and consumes it once', async () => {
    const pairing = await createTelegramPairing('owner');
    expect(pairing.code).toMatch(/^\d{6}$/);

    const first = await consumeTelegramPairing(pairing.code, {
      userId: '100',
      chatId: '200',
      username: 'anna',
    });
    expect(first).toBe('ok');

    const subs = await listTelegramSubscribers();
    expect(subs).toHaveLength(1);
    expect(subs[0].userId).toBe('100');
    expect(subs[0].bookings).toBe(true);
    expect(subs[0].orders).toBe(true);

    const second = await consumeTelegramPairing(pairing.code, {
      userId: '101',
      chatId: '201',
    });
    expect(second).toBe('invalid');
  });

  it('rejects wrong code and expired pairing', async () => {
    const pairing = await createTelegramPairing('owner');
    expect(await consumeTelegramPairing('000000', { userId: '1', chatId: '2' })).toBe('invalid');

    const storePath = path.join(tmpDir, 'telegram-subscribers.json');
    const raw = JSON.parse(await fs.readFile(storePath, 'utf-8')) as { pairing: { expiresAt: string } };
    raw.pairing.expiresAt = new Date(Date.now() - 1000).toISOString();
    await fs.writeFile(storePath, JSON.stringify(raw));
    expect(await consumeTelegramPairing(pairing.code, { userId: '1', chatId: '2' })).toBe('expired');
  });

  it('re-links existing user and supports prefs/revoke', async () => {
    const pairing = await createTelegramPairing('owner');
    await consumeTelegramPairing(pairing.code, { userId: '7', chatId: '70' });
    const again = await createTelegramPairing('owner');
    expect(await consumeTelegramPairing(again.code, { userId: '7', chatId: '71', firstName: 'Ira' })).toBe('ok');
    const [sub] = await listTelegramSubscribers();
    expect(sub.chatId).toBe('71');
    expect(sub.firstName).toBe('Ira');

    const patched = await patchTelegramSubscriber('7', { bookings: false, orders: true });
    expect(patched?.bookings).toBe(false);
    expect(await revokeTelegramSubscriber('7')).toBe(true);
    expect(await listTelegramSubscribers()).toHaveLength(0);
  });

  it('collects chat ids by subscription kind', () => {
    const subs = [
      { userId: '1', chatId: 'a', linkedAt: '', mute: false, bookings: true, orders: false },
      { userId: '2', chatId: 'b', linkedAt: '', mute: false, bookings: false, orders: true },
      { userId: '3', chatId: 'c', linkedAt: '', mute: true, bookings: true, orders: true },
    ];
    expect(subscriberReceives(subs[0], 'lead')).toBe(true);
    expect(subscriberReceives(subs[0], 'order')).toBe(false);
    expect(subscriberReceives(subs[2], 'ops')).toBe(false);
    expect(collectNotifyChatIds('lead', subs, 'legacy')).toEqual(['a', 'legacy']);
    expect(collectNotifyChatIds('order', subs, 'legacy')).toEqual(['b', 'legacy']);
    expect(collectNotifyChatIds('ops', subs, 'a')).toEqual(['a', 'b']);
  });
});
