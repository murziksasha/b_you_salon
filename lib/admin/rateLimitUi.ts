/**
 * Client helpers for HTTP 429 / Retry-After handling in admin UI.
 */

export function parseRetryAfterSeconds(res: Response, fallbackSeconds = 60): number {
  const header = res.headers.get('Retry-After');
  if (header) {
    const asInt = parseInt(header, 10);
    if (Number.isFinite(asInt) && asInt > 0) return asInt;
  }
  return fallbackSeconds;
}

export async function parseRetryAfterFromBody(
  res: Response,
  fallbackSeconds = 60,
): Promise<number> {
  const fromHeader = res.headers.get('Retry-After');
  if (fromHeader) {
    const asInt = parseInt(fromHeader, 10);
    if (Number.isFinite(asInt) && asInt > 0) return asInt;
  }

  try {
    const json = (await res.clone().json()) as { retryAfter?: number };
    if (typeof json.retryAfter === 'number' && json.retryAfter > 0) {
      return Math.ceil(json.retryAfter);
    }
  } catch {
    // ignore body parse errors
  }

  return fallbackSeconds;
}

/** Ukrainian message with optional countdown seconds. */
export function rateLimitMessage(seconds: number, context: 'login' | 'save' | 'upload' | 'generic' = 'generic'): string {
  const wait =
    seconds <= 0
      ? 'хвилину'
      : seconds === 1
        ? '1 секунду'
        : seconds < 60
          ? `${seconds} с`
          : `${Math.ceil(seconds / 60)} хв`;

  switch (context) {
    case 'login':
      return `Забагато спроб входу. Зачекайте ${wait}.`;
    case 'save':
      return `Забагато запитів збереження. Зачекайте ${wait}.`;
    case 'upload':
      return `Забагато завантажень. Зачекайте ${wait}.`;
    default:
      return `Забагато запитів. Зачекайте ${wait}.`;
  }
}

export function formatCountdown(seconds: number): string {
  if (seconds <= 0) return '0 с';
  if (seconds < 60) return `${seconds} с`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m} хв ${s} с` : `${m} хв`;
}
