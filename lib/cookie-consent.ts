/** Device-local cookie consent (localStorage + first-party cookie). */

export const CONSENT_STORAGE_KEY = 'byou-cookie-consent';
export const CONSENT_VERSION = 1;
export const CONSENT_MAX_AGE_SEC = 365 * 24 * 60 * 60;
export const CONSENT_OPEN_EVENT = 'byou-cookie-consent-open';

export type CookieConsentChoice = 'all' | 'necessary';

export type CookieConsent = {
  v: number;
  choice: CookieConsentChoice;
  at: string;
};

export function isCookieConsentChoice(v: unknown): v is CookieConsentChoice {
  return v === 'all' || v === 'necessary';
}

/** Compact cookie payload: `v1.all` / `v1.necessary`. */
export function serializeConsentCookie(consent: Pick<CookieConsent, 'v' | 'choice'>): string {
  return `v${consent.v}.${consent.choice}`;
}

export function serializeConsent(consent: CookieConsent): string {
  return JSON.stringify({ v: consent.v, choice: consent.choice, at: consent.at });
}

export function parseConsent(raw: string | null | undefined): CookieConsent | null {
  if (!raw) return null;
  const text = raw.trim();
  if (!text) return null;

  const compact = /^v(\d+)\.(all|necessary)$/.exec(text);
  if (compact) {
    const v = Number(compact[1]);
    if (v !== CONSENT_VERSION) return null;
    return { v, choice: compact[2] as CookieConsentChoice, at: '' };
  }

  try {
    const data = JSON.parse(text) as Partial<CookieConsent>;
    if (data.v !== CONSENT_VERSION || !isCookieConsentChoice(data.choice)) return null;
    return {
      v: CONSENT_VERSION,
      choice: data.choice,
      at: typeof data.at === 'string' ? data.at : '',
    };
  } catch {
    return null;
  }
}

export function readConsentFromCookieHeader(header: string): CookieConsent | null {
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const name = part.slice(0, idx).trim();
    if (name !== CONSENT_STORAGE_KEY) continue;
    const value = part.slice(idx + 1).trim();
    try {
      return parseConsent(decodeURIComponent(value));
    } catch {
      return parseConsent(value);
    }
  }
  return null;
}

export function cookieSetString(consent: CookieConsent): string {
  const value = encodeURIComponent(serializeConsentCookie(consent));
  return `${CONSENT_STORAGE_KEY}=${value}; Path=/; Max-Age=${CONSENT_MAX_AGE_SEC}; SameSite=Lax`;
}

export function makeConsent(choice: CookieConsentChoice, at = new Date().toISOString()): CookieConsent {
  return { v: CONSENT_VERSION, choice, at };
}

export function readStoredConsent(): CookieConsent | null {
  if (typeof window === 'undefined') return null;
  try {
    const fromLs = parseConsent(localStorage.getItem(CONSENT_STORAGE_KEY));
    if (fromLs) return fromLs;
  } catch {
    /* ignore */
  }
  try {
    return readConsentFromCookieHeader(document.cookie);
  } catch {
    return null;
  }
}

export function writeStoredConsent(choice: CookieConsentChoice): CookieConsent {
  const consent = makeConsent(choice);
  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, serializeConsent(consent));
  } catch {
    /* ignore */
  }
  try {
    document.cookie = cookieSetString(consent);
  } catch {
    /* ignore */
  }
  return consent;
}

export function requestCookieConsentOpen(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(CONSENT_OPEN_EVENT));
}

/** Same-origin relative path for the consent form redirect. */
export function consentReturnPath(raw: unknown): string {
  if (typeof raw !== 'string') return '/';
  const trimmed = raw.trim();
  if (!trimmed) return '/';
  if (trimmed.startsWith('/')) {
    if (trimmed.startsWith('//') || trimmed.includes('\\')) return '/';
    if (/[\u0000-\u001f\u007f]/.test(trimmed)) return '/';
    return trimmed.slice(0, 300) || '/';
  }
  try {
    const u = new URL(trimmed);
    const path = `${u.pathname}${u.search}`;
    if (!path.startsWith('/') || path.startsWith('//')) return '/';
    return path.slice(0, 300);
  } catch {
    return '/';
  }
}
