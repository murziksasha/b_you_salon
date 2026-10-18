import { appendActivity } from '@/lib/admin-activity';

type AuditInput = Parameters<typeof appendActivity>[0];

/**
 * Best-effort audit write. Never throws, but failures are logged instead of being silently
 * swallowed (security events must not disappear without a trace).
 */
export async function safeAudit(entry: AuditInput): Promise<void> {
  try {
    await appendActivity(entry);
  } catch (err) {
    console.error('[audit] failed to append activity', { kind: entry.kind, message: entry.message }, err);
  }
}
