/**
 * Isomorphic helpers for upload basenames (no Node/fs — safe for client bundles).
 */

const SAFE_NAME = /^[\w.-]+$/;

/** True when `name` is a single safe upload filename (no path segments). */
export function isSafeUploadName(name: string): boolean {
  if (!name || name.includes('..') || name.includes('/') || name.includes('\\')) return false;
  return SAFE_NAME.test(name);
}
