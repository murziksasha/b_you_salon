/** Detect phones that appear more than once in a list (duplicate clients). */

export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function buildPhoneCounts(phones: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of phones) {
    const d = phoneDigits(p);
    if (d.length < 9) continue;
    map.set(d, (map.get(d) || 0) + 1);
  }
  return map;
}

export function isDuplicatePhone(phone: string, counts: Map<string, number>): boolean {
  const d = phoneDigits(phone);
  return (counts.get(d) || 0) > 1;
}
