import { createHmac, timingSafeEqual } from 'crypto';
import { phoneToDigits } from './reply-templates';

function hmacSecret(): string {
  return process.env.SESSION_SECRET?.trim() || '';
}

export function signViberPhone(digits: string): string {
  const secret = hmacSecret();
  if (!secret || !digits) return '';
  return createHmac('sha256', secret).update(digits).digest('base64url');
}

export function verifyViberPhone(digits: string, sig: string): boolean {
  const expected = signViberPhone(digits);
  if (!expected || !sig) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(String(sig));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Public https path Telegram can put on a url button. Undefined if we cannot sign or have no origin. */
export function viberRedirectUrl(phone: string, siteUrl?: string): string | undefined {
  const origin = (siteUrl || '').replace(/\/+$/, '');
  const digits = phoneToDigits(phone);
  const sig = signViberPhone(digits);
  if (!origin || !digits || !sig) return undefined;
  const q = new URLSearchParams({ p: digits, s: sig });
  return `${origin}/r/viber?${q.toString()}`;
}
