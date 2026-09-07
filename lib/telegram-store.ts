import { randomInt, timingSafeEqual } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { atomicWriteJson } from './atomic-write';
import { withFileMutex } from './file-mutex';
import { BOT_TIMEZONE, clampHour } from './quiet-hours';

export type TelegramNotifyKind = 'lead' | 'order' | 'ops';

export type TelegramSubscriber = {
  userId: string;
  chatId: string;
  username?: string;
  firstName?: string;
  linkedAt: string;
  linkedBy?: string;
  mute: boolean;
  /** Callback + booking leads */
  bookings: boolean;
  /** Shop orders */
  orders: boolean;
};

export type TelegramPairing = {
  code: string;
  expiresAt: string;
  createdAt: string;
  createdBy: string;
};

export const DEFAULT_TELEGRAM_QUIET_START = 22;
export const DEFAULT_TELEGRAM_QUIET_END = 8;
export const TELEGRAM_ALIVE_TOUCH_MS = 2 * 60 * 1000;

export type TelegramBotSettings = {
  quietStart: number;
  quietEnd: number;
  timezone: string;
  lastAliveAt?: string;
  lastMorningDigestOn?: string;
  lastEveningDigestOn?: string;
  lastCatchupAt?: string;
};

export type TelegramBotStore = {
  subscribers: TelegramSubscriber[];
  pairing?: TelegramPairing | null;
  lastUpdateId?: number;
} & TelegramBotSettings;

const MAX_SUBSCRIBERS = 20;
const PAIRING_TTL_MS = 10 * 60 * 1000;

function dataRoot(): string {
  return process.env.DATA_DIR || path.join(process.cwd(), 'data');
}

export function telegramStorePath(): string {
  return path.join(dataRoot(), 'telegram-subscribers.json');
}

function defaultSettings(): TelegramBotSettings {
  return {
    quietStart: DEFAULT_TELEGRAM_QUIET_START,
    quietEnd: DEFAULT_TELEGRAM_QUIET_END,
    timezone: BOT_TIMEZONE,
  };
}

function emptyStore(): TelegramBotStore {
  return { subscribers: [], ...defaultSettings() };
}

function withSettings(parsed: Partial<TelegramBotStore> | null | undefined): TelegramBotSettings {
  const d = defaultSettings();
  return {
    quietStart: clampHour(parsed?.quietStart, d.quietStart),
    quietEnd: clampHour(parsed?.quietEnd, d.quietEnd),
    timezone: (parsed?.timezone || d.timezone).trim() || d.timezone,
    lastAliveAt: parsed?.lastAliveAt,
    lastMorningDigestOn: parsed?.lastMorningDigestOn,
    lastEveningDigestOn: parsed?.lastEveningDigestOn,
    lastCatchupAt: parsed?.lastCatchupAt,
  };
}

async function readStore(): Promise<TelegramBotStore> {
  try {
    const raw = await fs.readFile(telegramStorePath(), 'utf-8');
    const parsed = JSON.parse(raw) as TelegramBotStore;
    if (!parsed || !Array.isArray(parsed.subscribers)) return emptyStore();
    return {
      subscribers: parsed.subscribers,
      pairing: parsed.pairing || null,
      lastUpdateId: parsed.lastUpdateId,
      ...withSettings(parsed),
    };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return emptyStore();
    console.error('[telegram-store] failed to read', err);
    throw err;
  }
}

async function writeStore(store: TelegramBotStore): Promise<void> {
  await atomicWriteJson(telegramStorePath(), store);
}

function withStoreLock<T>(fn: () => Promise<T>): Promise<T> {
  return withFileMutex(telegramStorePath(), fn);
}

export function normalizePairingCode(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase();
}

export function pairingCodesEqual(a: string, b: string): boolean {
  const left = Buffer.from(normalizePairingCode(a));
  const right = Buffer.from(normalizePairingCode(b));
  if (left.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function generatePairingCode(): string {
  return String(randomInt(100000, 1000000));
}

export function subscriberReceives(
  sub: TelegramSubscriber,
  kind: TelegramNotifyKind,
): boolean {
  if (sub.mute) return false;
  if (kind === 'ops') return true;
  if (kind === 'lead') return sub.bookings !== false;
  if (kind === 'order') return sub.orders !== false;
  return false;
}

export function collectNotifyChatIds(
  kind: TelegramNotifyKind,
  subscribers: TelegramSubscriber[],
  legacyChatId?: string,
): string[] {
  const ids = new Set<string>();
  for (const sub of subscribers) {
    if (!sub.chatId) continue;
    if (subscriberReceives(sub, kind)) ids.add(String(sub.chatId));
  }
  const legacy = (legacyChatId || '').trim();
  if (legacy) ids.add(legacy);
  return Array.from(ids);
}

export async function listTelegramSubscribers(): Promise<TelegramSubscriber[]> {
  const store = await readStore();
  return store.subscribers;
}

export async function getTelegramSubscriber(userId: string): Promise<TelegramSubscriber | null> {
  const id = String(userId || '').trim();
  if (!id) return null;
  const store = await readStore();
  return store.subscribers.find((s) => s.userId === id) || null;
}

export async function getTelegramPairing(): Promise<TelegramPairing | null> {
  const store = await readStore();
  const pairing = store.pairing;
  if (!pairing) return null;
  if (Date.parse(pairing.expiresAt) <= Date.now()) return null;
  return pairing;
}

export async function createTelegramPairing(createdBy: string): Promise<TelegramPairing> {
  return withStoreLock(async () => {
    const store = await readStore();
    const now = Date.now();
    const pairing: TelegramPairing = {
      code: generatePairingCode(),
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + PAIRING_TTL_MS).toISOString(),
      createdBy: (createdBy || 'admin').trim() || 'admin',
    };
    store.pairing = pairing;
    await writeStore(store);
    return pairing;
  });
}

export type ConsumePairingResult = 'ok' | 'invalid' | 'expired' | 'full';

export async function consumeTelegramPairing(
  code: string,
  profile: {
    userId: string;
    chatId: string;
    username?: string;
    firstName?: string;
  },
): Promise<ConsumePairingResult> {
  const userId = String(profile.userId || '').trim();
  const chatId = String(profile.chatId || '').trim();
  if (!userId || !chatId) return 'invalid';

  return withStoreLock(async () => {
    const store = await readStore();
    const pairing = store.pairing;
    if (!pairing || !pairingCodesEqual(pairing.code, code)) return 'invalid';
    if (Date.parse(pairing.expiresAt) <= Date.now()) {
      store.pairing = null;
      await writeStore(store);
      return 'expired';
    }

    const now = new Date().toISOString();
    const existing = store.subscribers.findIndex((s) => s.userId === userId);
    if (existing >= 0) {
      const prev = store.subscribers[existing];
      store.subscribers[existing] = {
        ...prev,
        chatId,
        username: profile.username || prev.username,
        firstName: profile.firstName || prev.firstName,
        linkedAt: now,
        linkedBy: pairing.createdBy,
      };
    } else {
      if (store.subscribers.length >= MAX_SUBSCRIBERS) return 'full';
      store.subscribers.push({
        userId,
        chatId,
        username: profile.username,
        firstName: profile.firstName,
        linkedAt: now,
        linkedBy: pairing.createdBy,
        mute: false,
        bookings: true,
        orders: true,
      });
    }
    store.pairing = null;
    await writeStore(store);
    return 'ok';
  });
}

export async function patchTelegramSubscriber(
  userId: string,
  patch: Partial<Pick<TelegramSubscriber, 'mute' | 'bookings' | 'orders' | 'chatId'>>,
): Promise<TelegramSubscriber | null> {
  const id = String(userId || '').trim();
  if (!id) return null;
  return withStoreLock(async () => {
    const store = await readStore();
    const idx = store.subscribers.findIndex((s) => s.userId === id);
    if (idx < 0) return null;
    store.subscribers[idx] = { ...store.subscribers[idx], ...patch };
    await writeStore(store);
    return store.subscribers[idx];
  });
}

export async function revokeTelegramSubscriber(userId: string): Promise<boolean> {
  const id = String(userId || '').trim();
  if (!id) return false;
  return withStoreLock(async () => {
    const store = await readStore();
    const next = store.subscribers.filter((s) => s.userId !== id);
    if (next.length === store.subscribers.length) return false;
    store.subscribers = next;
    await writeStore(store);
    return true;
  });
}

export async function getTelegramLastUpdateId(): Promise<number | undefined> {
  const store = await readStore();
  return store.lastUpdateId;
}

export async function setTelegramLastUpdateId(id: number): Promise<void> {
  if (!Number.isFinite(id)) return;
  return withStoreLock(async () => {
    const store = await readStore();
    store.lastUpdateId = id;
    await writeStore(store);
  });
}

export async function hasTelegramSubscribers(): Promise<boolean> {
  const store = await readStore();
  return store.subscribers.length > 0;
}

export async function getTelegramBotSettings(): Promise<TelegramBotSettings> {
  const store = await readStore();
  return withSettings(store);
}

export async function patchTelegramBotSettings(
  patch: Partial<Pick<TelegramBotSettings, 'quietStart' | 'quietEnd' | 'lastAliveAt' | 'lastMorningDigestOn' | 'lastEveningDigestOn' | 'lastCatchupAt'>>,
): Promise<TelegramBotSettings> {
  return withStoreLock(async () => {
    const store = await readStore();
    if (patch.quietStart !== undefined) store.quietStart = clampHour(patch.quietStart, store.quietStart);
    if (patch.quietEnd !== undefined) store.quietEnd = clampHour(patch.quietEnd, store.quietEnd);
    if (patch.lastAliveAt !== undefined) store.lastAliveAt = patch.lastAliveAt;
    if (patch.lastMorningDigestOn !== undefined) store.lastMorningDigestOn = patch.lastMorningDigestOn;
    if (patch.lastEveningDigestOn !== undefined) store.lastEveningDigestOn = patch.lastEveningDigestOn;
    if (patch.lastCatchupAt !== undefined) store.lastCatchupAt = patch.lastCatchupAt;
    await writeStore(store);
    return withSettings(store);
  });
}

/** Persist lastAliveAt at most every TELEGRAM_ALIVE_TOUCH_MS. */
export async function touchTelegramLastAlive(now = new Date()): Promise<void> {
  const iso = now.toISOString();
  return withStoreLock(async () => {
    const store = await readStore();
    const prev = store.lastAliveAt ? Date.parse(store.lastAliveAt) : 0;
    if (Number.isFinite(prev) && now.getTime() - prev < TELEGRAM_ALIVE_TOUCH_MS) return;
    store.lastAliveAt = iso;
    await writeStore(store);
  });
}
