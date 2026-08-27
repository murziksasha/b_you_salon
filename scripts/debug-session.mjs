const secret =
  process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || 'dev-insecure-session-secret-change-me';
console.log('secret_len', secret.length);

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function main() {
  const cookie = process.argv[2];
  if (!cookie) {
    console.log('usage: node debug-session.mjs <cookie>');
    process.exit(1);
  }
  const [token, expiry, signature] = cookie.split('.');
  const payload = `${token}.${expiry}`;
  console.log('parts', { tokenLen: token?.length, expiry, sigLen: signature?.length });

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );

  const sig = fromHex(signature);
  const data = new TextEncoder().encode(payload);

  try {
    console.log('verify-u8', await crypto.subtle.verify('HMAC', key, sig, data));
  } catch (e) {
    console.log('verify-u8-err', e.message);
  }

  try {
    const ab = sig.buffer.slice(sig.byteOffset, sig.byteOffset + sig.byteLength);
    console.log('verify-ab', await crypto.subtle.verify('HMAC', key, ab, data));
  } catch (e) {
    console.log('verify-ab-err', e.message);
  }

  const newSig = toHex(await crypto.subtle.sign('HMAC', key, data));
  console.log('resign-match', newSig === signature);
  console.log('newSig', newSig.slice(0, 20));
  console.log('oldSig', signature.slice(0, 20));
}

main();
