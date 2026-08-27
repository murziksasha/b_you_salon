export const SESSION_COOKIE = 'admin_session';

const SESSION_MAX_AGE_MS = 60 * 60 * 24 * 7 * 1000; // 7 days

/**
 * Read secret at call time (not module load) so Docker runtime env is used.
 * Prefer SESSION_SECRET; fall back to ADMIN_PASSWORD for local convenience.
 */
function getSecret(): string {
  const secret = process.env['SESSION_SECRET'] || process.env['ADMIN_PASSWORD'];
  if (!secret) {
    return 'dev-insecure-session-secret-change-me';
  }
  return secret;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
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
  return crypto.subtle.importKey(
    'raw',
    enc.encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
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
  const raw = `${claims.username}|${claims.role}`;
  return toHex(new TextEncoder().encode(raw));
}

function decodeClaims(hex: string): SessionClaims | null {
  if (!hex) return null;
  const bytes = fromHex(hex);
  if (!bytes) return null;
  try {
    const raw = new TextDecoder().decode(bytes);
    const [username, role] = raw.split('|');
    if (!username) return null;
    return { username, role: role || 'owner' };
  } catch {
    return null;
  }
}

/**
 * Create a signed session cookie value.
 * Format: `token.expiry.signature` (legacy 3 parts)
 * or `token.expiry.claimsHex.signature` (4 parts with user claims)
 */
export async function createSessionToken(claims?: SessionClaims): Promise<string> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = toHex(bytes);
  const expiry = String(Date.now() + SESSION_MAX_AGE_MS);
  const claimsHex = encodeClaims(claims);
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
  // 3 parts: token.expiry.sig  OR  4 parts: token.expiry.claims.sig
  if (parts.length !== 3 && parts.length !== 4) return { valid: false };

  let token: string;
  let expiry: string;
  let claimsHex = '';
  let signature: string;

  if (parts.length === 3) {
    [token, expiry, signature] = parts;
  } else {
    [token, expiry, claimsHex, signature] = parts;
  }

  if (!token || !expiry || !signature) return { valid: false };

  const payload =
    parts.length === 4 ? `${token}.${expiry}.${claimsHex}` : `${token}.${expiry}`;
  const ok = await verifySignature(payload, signature);
  if (!ok) return { valid: false };

  const exp = Number(expiry);
  if (!Number.isFinite(exp) || Date.now() > exp) return { valid: false };

  return {
    valid: true,
    token,
    claims: claimsHex ? decodeClaims(claimsHex) : { username: 'admin', role: 'legacy' },
    fingerprint: token.slice(0, 16),
  };
}

/** Validate signed session cookie. */
export async function isValidSession(session: string | undefined): Promise<boolean> {
  const parsed = await parseSession(session);
  return parsed.valid;
}

export const SESSION_MAX_AGE_SECONDS = Math.floor(SESSION_MAX_AGE_MS / 1000);
