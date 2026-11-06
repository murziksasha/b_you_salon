import zlib from 'zlib';
import { getProducts } from '../lib/site-data';
import { collectCategories, queryCatalog } from '../lib/shop-catalog';

const API_MAX_RAW_BYTES = 150 * 1024; // 150 KB
const API_MAX_GZIP_BYTES = 30 * 1024; // 30 KB

function formatBytes(bytes: number): string {
  return `${(bytes / 1024).toFixed(2)} KB (${bytes.toLocaleString()} bytes)`;
}

async function main() {
  console.log('[payload] Measuring representative catalog batch payloads...');

  const products = await getProducts();
  const visible = products.filter((p) => p.visible);
  console.log(`[payload] Total catalog products: ${products.length} (${visible.length} visible)`);

  const categories = collectCategories(visible);
  const result = queryCatalog(products, {
    page: 1,
    pageSize: 36,
    sort: 'manual',
  });

  const payloadObject = {
    ...result,
    categories,
  };

  const jsonStr = JSON.stringify(payloadObject);
  const rawBytes = Buffer.byteLength(jsonStr, 'utf-8');
  const gzipBytes = zlib.gzipSync(Buffer.from(jsonStr, 'utf-8')).byteLength;
  const brotliBytes = zlib.brotliCompressSync(Buffer.from(jsonStr, 'utf-8')).byteLength;

  console.log('\n--- Catalog API Batch Measurement (36 cards) ---');
  console.log(`Raw JSON:  ${formatBytes(rawBytes)} (Limit: ${formatBytes(API_MAX_RAW_BYTES)})`);
  console.log(`Gzip:      ${formatBytes(gzipBytes)} (Limit: ${formatBytes(API_MAX_GZIP_BYTES)})`);
  console.log(`Brotli:    ${formatBytes(brotliBytes)}`);

  let overBudget = false;

  if (rawBytes > API_MAX_RAW_BYTES) {
    console.error(`[ERROR] Raw payload exceeds limit by ${rawBytes - API_MAX_RAW_BYTES} bytes!`);
    overBudget = true;
  }

  if (gzipBytes > API_MAX_GZIP_BYTES) {
    console.error(`[ERROR] Gzip payload exceeds limit by ${gzipBytes - API_MAX_GZIP_BYTES} bytes!`);
    overBudget = true;
  }

  // Also probe live /shop HTML if dev/staging server is available
  const port = process.env.PORT || '3001';
  try {
    const res = await fetch(`http://127.0.0.1:${port}/shop`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      const html = await res.text();
      const htmlRaw = Buffer.byteLength(html, 'utf-8');
      const htmlGzip = zlib.gzipSync(Buffer.from(html, 'utf-8')).byteLength;
      console.log('\n--- Live /shop Page HTML Measurement ---');
      console.log(`HTML Raw:  ${formatBytes(htmlRaw)}`);
      console.log(`HTML Gzip: ${formatBytes(htmlGzip)}`);
    }
  } catch {
    // Live server not running, in-process measurement sufficient
  }

  if (overBudget) {
    console.error('\n[payload] FAILED: Payload exceeded size budget.');
    process.exit(1);
  } else {
    console.log('\n[payload] PASSED: All payload sizes are within budget.');
  }
}

main().catch((err) => {
  console.error('[payload] Fatal measurement error:', err);
  process.exit(1);
});

