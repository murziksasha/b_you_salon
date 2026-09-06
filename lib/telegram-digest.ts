import { listLeads } from './leads';
import { broadcastTelegram } from './notify';
import { listOrders } from './orders';
import { buildCatchupDigest, buildEveningDigest, buildMorningDigest } from './process-digest';
import { kyivClock } from './quiet-hours';
import {
  getTelegramBotSettings,
  patchTelegramBotSettings,
  touchTelegramLastAlive,
  type TelegramBotSettings,
} from './telegram-store';

export const TELEGRAM_EVENING_HOUR = 18;
export const TELEGRAM_CATCHUP_GAP_MS = 15 * 60 * 1000;
export const TELEGRAM_DEFAULT_MORNING_HOUR = 8;

export function morningHour(settings: Pick<TelegramBotSettings, 'quietStart' | 'quietEnd'>): number {
  if (settings.quietStart === settings.quietEnd) return TELEGRAM_DEFAULT_MORNING_HOUR;
  return settings.quietEnd;
}

export function shouldSendMorningDigest(now: Date, settings: TelegramBotSettings): boolean {
  const { hour, dateKey } = kyivClock(now);
  if (hour < morningHour(settings)) return false;
  return settings.lastMorningDigestOn !== dateKey;
}

export function shouldSendEveningDigest(now: Date, settings: TelegramBotSettings): boolean {
  const { hour, dateKey } = kyivClock(now);
  if (hour < TELEGRAM_EVENING_HOUR) return false;
  return settings.lastEveningDigestOn !== dateKey;
}

export function shouldCatchup(now: Date, lastAliveAt?: string): boolean {
  if (!lastAliveAt) return false;
  const t = Date.parse(lastAliveAt);
  if (!Number.isFinite(t)) return false;
  return now.getTime() - t > TELEGRAM_CATCHUP_GAP_MS;
}

export async function runCatchupIfNeeded(now = new Date()): Promise<boolean> {
  const settings = await getTelegramBotSettings();
  if (!shouldCatchup(now, settings.lastAliveAt)) {
    await touchTelegramLastAlive(now);
    return false;
  }
  const [leads, orders] = await Promise.all([listLeads(), listOrders()]);
  const text = buildCatchupDigest(leads, orders, settings.lastAliveAt || now.toISOString());
  await patchTelegramBotSettings({ lastCatchupAt: now.toISOString() });
  await touchTelegramLastAlive(now);
  if (!text) return false;
  return broadcastTelegram(text, 'ops');
}

export async function tickTelegramDigest(now = new Date()): Promise<{ morning: boolean; evening: boolean }> {
  const settings = await getTelegramBotSettings();
  const morningDue = shouldSendMorningDigest(now, settings);
  const eveningDue = shouldSendEveningDigest(now, settings);
  if (!morningDue && !eveningDue) {
    await touchTelegramLastAlive(now);
    return { morning: false, evening: false };
  }

  const { dateKey } = kyivClock(now);
  const [leads, orders] = await Promise.all([listLeads(), listOrders()]);
  let morning = false;
  let evening = false;

  if (morningDue) {
    morning = await broadcastTelegram(buildMorningDigest(leads, orders), 'ops');
    if (morning) await patchTelegramBotSettings({ lastMorningDigestOn: dateKey });
  }

  if (eveningDue) {
    evening = await broadcastTelegram(buildEveningDigest(leads, orders), 'ops');
    if (evening) await patchTelegramBotSettings({ lastEveningDigestOn: dateKey });
  }

  await touchTelegramLastAlive(now);
  return { morning, evening };
}
