export const SESSION_COOKIE = 'admin_session';

const SESSION_MAX_AGE_MS = 60 * 60 * 24 * 7 * 1000; // 7 days

const KNOWN_INSECURE_SECRETS = new Set([
  'byou-dev-session-secret-change-me',
  'replace-with-long-random-string',
  'dev-insecure-session-secret-change-me',
]);

export const MIN_SESSION_SECRET_LENGTH = 32;

/**
 * Read secret at call time (not module load) so Docker runtime env is used.
 * Production requires SESSION_SECRET (>= 32 chars, not a known placeholder).
 * ALLOW_LEGACY_SESSION_SECRET=true temporarily re-enables the ADMIN_PASSWORD fallback (deprecated).
 */
export function getSessionSecret(): string {
  const secret = process.env['SESSION_SECRET'] || '';
  const strong = secret.length >= MIN_SESSION_SECRET_LENGTH && !KNOWN_INSECURE_SECRETS.has(secret);
  if (process.env.NODE_ENV === 'production') {
    if (strong) return secret;
    const legacy = process.env['ADMIN_PASSWORD'];
    if (process.env['ALLOW_LEGACY_SESSION_SECRET'] === 'true' && (secret || legacy)) {
      console.warn('[session] WARNING: weak/legacy session secret in use (ALLOW_LEGACY_SESSION_SECRET). Set SESSION_SECRET.');
      return secret || (legacy as string);
    }
    throw new Error(
      `FATAL: SESSION_SECRET (>= ${MIN_SESSION_SECRET_LENGTH} chars, not a placeholder) must be set in production.`,
    );
  }
  const fallback = secret || process.env['ADMIN_PASSWORD'];
  if (fallback) return fallback;
  console.warn('[session] WARNING: No SESSION_SECRET set. Using insecure dev fallback. Do NOT use this in production.');
  return 'dev-insecure-session-secret-change-me';
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

async function getHmacKey(): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey('raw', enc.encode(getSessionSecret()), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

async function sign(payload: string): Promise<string> {
  const key = await getHmacKey();
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return toHex(new Uint8Array(signature));
}

async function verifySignature(payload: string, signatureHex: string): Promise<boolean> {
  const key = await getHmacKey();
  const sig = fromHex(signatureHex);
  if (!sig) return false;
  try {
    const sigCopy = new Uint8Array(sig);
    return await crypto.subtle.verify('HMAC', key, sigCopy, new TextEncoder().encode(payload));
  } catch {
    return false;
  }
}

export type SessionClaims = {
  username: string;
  role: string;
};

function encodeClaims(claims?: SessionClaims): string {
  if (!claims) return '';
  const raw = JSON.stringify({ u: claims.username, r: claims.role });
  return toHex(new TextEncoder().encode(raw));
}

function decodeClaims(hex: string): SessionClaims | null {
  if (!hex) return null;
  const bytes = fromHex(hex);
  if (!bytes) return null;
  try {
    const raw = new TextDecoder().decode(bytes);
    // Support both new JSON format and legacy pipe-delimited format
    if (raw.startsWith('{')) {
      const parsed = JSON.parse(raw) as { u?: string; r?: string };
      if (!parsed.u) return null;
      if (!parsed.r) return null;
      return { username: parsed.u, role: parsed.r };
    }
    // Legacy pipe-delimited fallback (read-only, will be re-encoded as JSON on next login)
    const pipeIdx = raw.indexOf('|');
    if (pipeIdx < 0) return null;
    const username = raw.slice(0, pipeIdx);
    const role = raw.slice(pipeIdx + 1);
    if (!username || !role) return null;
    return { username, role };
  } catch {
    return null;
  }
}

/**
 * Create a signed session cookie value.
 * Format: `token.expiry.claimsHex.signature`.
 */
export async function createSessionToken(claims?: SessionClaims): Promise<string> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = toHex(bytes);
  const expiry = String(Date.now() + SESSION_MAX_AGE_MS);
  // Tokens always carry claims; claim-less tokens are rejected on parse.
  const claimsHex = encodeClaims(claims ?? { username: 'admin', role: 'legacy' });
  const payload = claimsHex ? `${token}.${expiry}.${claimsHex}` : `${token}.${expiry}`;
  const signature = await sign(payload);
  return `${payload}.${signature}`;
}

export type ParsedSession = {
  valid: boolean;
  token?: string;
  claims?: SessionClaims | null;
  fingerprint?: string;
};

/** Validate signed session cookie and extract claims. */
export async function parseSession(session: string | undefined): Promise<ParsedSession> {
  if (!session) return { valid: false };

  const parts = session.split('.');
  // Only 4-part tokens with claims are accepted (legacy 3-part tokens -> re-login).
  if (parts.length !== 4) return { valid: false };
  const [token, expiry, claimsHex, signature] = parts as [string, string, string, string];
  if (!token || !expiry || !claimsHex || !signature) return { valid: false };

  const payload = `${token}.${expiry}.${claimsHex}`;
  const ok = await verifySignature(payload, signature);
  if (!ok) return { valid: false };

  const exp = Number(expiry);
  if (!Number.isFinite(exp) || Date.now() > exp) return { valid: false };

  const claims = decodeClaims(claimsHex);
  if (!claims) return { valid: false };

  return {
    valid: true,
    token,
    claims,
    fingerprint: token.slice(0, 16),
  };
}

/** Validate signed session cookie. */
export async function isValidSession(session: string | undefined): Promise<boolean> {
  const parsed = await parseSession(session);
  return parsed.valid;
}

export const SESSION_MAX_AGE_SECONDS = Math.floor(SESSION_MAX_AGE_MS / 1000);
