const FORMULA_CHARS = new Set(['=', '+', '-', '@', '\t', '\r']);

/** Escape a CSV field (RFC-style with formula injection mitigation). */
export function csvField(value: unknown): string {
  let s = String(value ?? '');
  if (s.length > 0 && FORMULA_CHARS.has(s[0])) {
    s = `'${s}`;
  }
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvField).join(',')];
  for (const row of rows) {
    lines.push(row.map(csvField).join(','));
  }
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}
