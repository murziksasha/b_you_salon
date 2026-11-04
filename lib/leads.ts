import { promises as fs } from 'fs';
import path from 'path';
import { z } from 'zod';
import { atomicWriteJson } from './atomic-write';
import { withFileMutex } from './file-mutex';
import { createId } from './id';
import { evaluateLeadRetention } from './retention';
import type { UtmParams } from './utm';
import {
  CLOSE_OUTCOMES,
  WORKFLOW_STATUSES,
  handledFromStatus,
  isCloseOutcome,
  isWorkflowStatus,
  normalizeStatus,
  type CloseOutcome,
  type WorkflowStatus,
} from './workflow';

export interface LeadAuditEntry {
  at: string;
  action: 'created' | 'handled' | 'reopened' | 'note' | 'emailed' | 'status' | 'callback' | 'assign' | 'outcome';
  detail?: string;
}

export interface Lead {
  id: string;
  phone: string;
  createdAt: string;
  source: 'callback' | 'booking';
  zone?: 'home' | 'salon' | 'shop';
  serviceId?: string;
  serviceTitle?: string;
  comment?: string;
  emailed: boolean;
  handled: boolean;
  /** Workflow status; if missing, derived from `handled`. */
  status?: WorkflowStatus;
  note?: string;
  /** Close outcome when done/spam/no_answer */
  outcome?: CloseOutcome;
  /** Operator username who claimed the lead */
  assignee?: string;
  claimedAt?: string;
  pagePath?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  handledAt?: string;
  /** Schedule callback ISO */
  callbackAt?: string;
  audit?: LeadAuditEntry[];
  telegram?: boolean;
}

export interface LeadsStore {
  leads: Lead[];
}

const leadAuditSchema = z.object({
  at: z.string(),
  action: z.enum(['created', 'handled', 'reopened', 'note', 'emailed', 'status', 'callback', 'assign', 'outcome']),
  detail: z.string().optional(),
}).passthrough();

export const leadSchema = z.object({
  id: z.string().min(1),
  phone: z.string().min(1),
  createdAt: z.string().min(1),
  source: z.enum(['callback', 'booking']).catch('callback'),
  zone: z.enum(['home', 'salon', 'shop']).optional(),
  serviceId: z.string().optional(),
  serviceTitle: z.string().optional(),
  comment: z.string().optional(),
  emailed: z.boolean(),
  handled: z.boolean(),
  status: z.enum(WORKFLOW_STATUSES).optional(),
  note: z.string().optional(),
  outcome: z.enum(CLOSE_OUTCOMES).optional(),
  assignee: z.string().optional(),
  claimedAt: z.string().optional(),
  pagePath: z.string().optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  utmContent: z.string().optional(),
  utmTerm: z.string().optional(),
  handledAt: z.string().optional(),
  callbackAt: z.string().optional(),
  audit: z.array(leadAuditSchema).optional(),
  telegram: z.boolean().optional(),
}).passthrough();

export const leadsStoreSchema = z.object({
  leads: z.array(leadSchema),
});

const MAX_AUDIT = 30;

function dataRoot(): string {
  return process.env.DATA_DIR || path.join(process.cwd(), 'data');
}

export function leadsFilePath(): string {
  return path.join(dataRoot(), 'leads.json');
}

async function readStore(): Promise<LeadsStore> {
  try {
    const raw = await fs.readFile(leadsFilePath(), 'utf-8');
    const parsed = JSON.parse(raw);
    const result = leadsStoreSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(`Corrupted or invalid leads store: ${result.error.message}`);
    }
    return result.data as LeadsStore;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return { leads: [] };
    // Transient I/O or parse error — propagate instead of silently returning empty
    console.error('[leads] Failed to read leads.json:', err);
    throw err;
  }
}

async function writeStore(store: LeadsStore): Promise<void> {
  const valid = leadsStoreSchema.parse(store);
  await atomicWriteJson(leadsFilePath(), valid);
}

function withLeadsLock<T>(fn: () => Promise<T>): Promise<T> {
  return withFileMutex(leadsFilePath(), fn);
}

function pushAudit(lead: Lead, entry: LeadAuditEntry): LeadAuditEntry[] {
  const list = [...(lead.audit || []), entry];
  return list.slice(-MAX_AUDIT);
}

export function withNormalizedLead(lead: Lead): Lead {
  const status = normalizeStatus(lead.status, lead.handled);
  return {
    ...lead,
    status,
    handled: handledFromStatus(status),
  };
}

export async function listLeads(): Promise<Lead[]> {
  const store = await readStore();
  return store.leads.map(withNormalizedLead);
}

/** Open leads matching phone (for dedup). */
export async function findOpenLeadsByPhone(phone: string): Promise<Lead[]> {
  const { phonesMatch } = await import('./phone');
  const leads = await listLeads();
  return leads.filter(l => {
    const st = normalizeStatus(l.status, l.handled);
    if (st === 'done' || st === 'spam') return false;
    return phonesMatch(l.phone, phone);
  });
}

export async function countLeads(opts?: { unhandledOnly?: boolean }): Promise<number> {
  const leads = await listLeads();
  if (opts?.unhandledOnly) {
    return leads.filter(l => !handledFromStatus(normalizeStatus(l.status, l.handled))).length;
  }
  return leads.length;
}

export async function appendLead(input: {
  phone: string;
  emailed: boolean;
  source?: Lead['source'];
  zone?: Lead['zone'];
  serviceId?: string;
  serviceTitle?: string;
  comment?: string;
  pagePath?: string;
  utm?: UtmParams;
  telegram?: boolean;
}): Promise<Lead> {
  return withLeadsLock(async () => {
    const store = await readStore();
    const now = new Date().toISOString();
    const lead: Lead = {
      id: createId(),
      phone: input.phone,
      createdAt: now,
      source: input.source || 'callback',
      zone: input.zone,
      serviceId: input.serviceId,
      serviceTitle: input.serviceTitle,
      comment: (input.comment || '').trim() || undefined,
      emailed: input.emailed,
      handled: false,
      status: 'new',
      ...(input.pagePath ? { pagePath: input.pagePath } : {}),
      ...(input.utm?.utmSource ? { utmSource: input.utm.utmSource } : {}),
      ...(input.utm?.utmMedium ? { utmMedium: input.utm.utmMedium } : {}),
      ...(input.utm?.utmCampaign ? { utmCampaign: input.utm.utmCampaign } : {}),
      ...(input.utm?.utmContent ? { utmContent: input.utm.utmContent } : {}),
      ...(input.utm?.utmTerm ? { utmTerm: input.utm.utmTerm } : {}),
      ...(typeof input.telegram === 'boolean' ? { telegram: input.telegram } : {}),
      audit: [{ at: now, action: 'created' }],
    };
    store.leads.unshift(lead);
    await writeStore(store);
    return withNormalizedLead(lead);
  });
}

export type LeadPatch = Partial<
  Pick<Lead, 'handled' | 'note' | 'emailed' | 'status' | 'callbackAt' | 'outcome' | 'assignee'>
>;

export async function updateLead(id: string, patch: LeadPatch): Promise<Lead | null> {
  return withLeadsLock(async () => {
    const store = await readStore();
    const idx = store.leads.findIndex(l => l.id === id);
    if (idx < 0) return null;
    const current = withNormalizedLead(store.leads[idx]);
    const now = new Date().toISOString();
    let audit = current.audit || [];

    let nextStatus = current.status || 'new';
    if (patch.status !== undefined && isWorkflowStatus(patch.status)) {
      nextStatus = patch.status;
    } else if (typeof patch.handled === 'boolean') {
      nextStatus = patch.handled
        ? 'done'
        : current.status === 'done' || current.status === 'spam'
          ? 'new'
          : current.status || 'new';
      if (patch.handled === false && (current.status === 'done' || current.status === 'spam')) {
        nextStatus = 'new';
      }
      if (patch.handled === true) nextStatus = 'done';
    }

    if (nextStatus !== current.status) {
      audit = pushAudit({ ...current, audit }, { at: now, action: 'status', detail: nextStatus });
      if (handledFromStatus(nextStatus) && !handledFromStatus(current.status || 'new')) {
        audit = pushAudit({ ...current, audit }, { at: now, action: 'handled' });
      } else if (!handledFromStatus(nextStatus) && handledFromStatus(current.status || 'new')) {
        audit = pushAudit({ ...current, audit }, { at: now, action: 'reopened' });
      }
    }

    if (patch.note !== undefined && patch.note !== current.note) {
      audit = pushAudit({ ...current, audit }, { at: now, action: 'note', detail: String(patch.note).slice(0, 200) });
    }
    if (typeof patch.emailed === 'boolean' && patch.emailed && !current.emailed) {
      audit = pushAudit({ ...current, audit }, { at: now, action: 'emailed' });
    }
    if (patch.callbackAt !== undefined && patch.callbackAt !== current.callbackAt) {
      audit = pushAudit(
        { ...current, audit },
        { at: now, action: 'callback', detail: patch.callbackAt?.slice(0, 40) || 'cleared' },
      );
    }
    if (patch.assignee !== undefined && patch.assignee !== current.assignee) {
      audit = pushAudit({ ...current, audit }, { at: now, action: 'assign', detail: patch.assignee || 'unassigned' });
    }
    const nextOutcome = patch.outcome !== undefined && isCloseOutcome(patch.outcome) ? patch.outcome : current.outcome;
    if (patch.outcome !== undefined && patch.outcome !== current.outcome) {
      audit = pushAudit({ ...current, audit }, { at: now, action: 'outcome', detail: String(patch.outcome || '') });
    }

    const closed = handledFromStatus(nextStatus);
    const next: Lead = {
      ...current,
      status: nextStatus,
      handled: closed,
      note: patch.note !== undefined ? patch.note : current.note,
      emailed: typeof patch.emailed === 'boolean' ? patch.emailed : current.emailed,
      callbackAt: patch.callbackAt !== undefined ? patch.callbackAt || undefined : current.callbackAt,
      outcome: closed ? nextOutcome : undefined,
      assignee: patch.assignee !== undefined ? patch.assignee || undefined : current.assignee,
      claimedAt:
        patch.assignee !== undefined ? (patch.assignee ? current.claimedAt || now : undefined) : current.claimedAt,
      audit,
      handledAt: closed ? current.handledAt || now : undefined,
    };
    store.leads[idx] = next;
    await writeStore(store);
    return withNormalizedLead(next);
  });
}

export async function deleteLead(id: string): Promise<boolean> {
  return withLeadsLock(async () => {
    const store = await readStore();
    const before = store.leads.length;
    store.leads = store.leads.filter(l => l.id !== id);
    if (store.leads.length === before) return false;
    await writeStore(store);
    return true;
  });
}

export interface RetentionPurgeResult {
  purgedCount: number;
  retainedCount: number;
  undatedLegacyCount: number;
}

/**
 * Idempotent retention purge:
 * Deletes leads where status is 'done' or 'spam' AND handledAt is older than 12 months.
 * Retains 'new', 'in_progress', 'no_answer', reopened, and legacy undated items.
 */
export async function purgeExpiredLeads(now = Date.now()): Promise<RetentionPurgeResult> {
  return withLeadsLock(async () => {
    const store = await readStore();
    const refDate = new Date(now);
    let undatedLegacyCount = 0;
    const initialCount = store.leads.length;

    const remaining = store.leads.filter((lead) => {
      const evaluation = evaluateLeadRetention(lead, refDate);
      if (evaluation.reason === 'missing_handled_at') {
        undatedLegacyCount++;
      }
      return !evaluation.purgeable;
    });

    const purgedCount = initialCount - remaining.length;
    if (purgedCount > 0) {
      store.leads = remaining;
      await writeStore(store);
    }

    if (undatedLegacyCount > 0) {
      console.warn(`[leads retention] Retained ${undatedLegacyCount} closed leads missing handledAt for review`);
    }

    return { purgedCount, retainedCount: remaining.length, undatedLegacyCount };
  });
}
