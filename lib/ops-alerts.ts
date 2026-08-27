import { promises as fs } from 'fs';
import path from 'path';
import { atomicWriteJson } from './atomic-write';
import { sendTelegramMessage, telegramConfigured } from './notify';
import { listSiteBackups } from './backup';
import { listLeads } from './leads';
import { listOrders } from './orders';
import { buildSlaReminder } from './process-digest';

type AlertsState = {
  lastBackupAlertAt?: string;
  lastSmtpAlertAt?: string;
  lastSlaAlertAt?: string;
};

function dataRoot(): string {
  return process.env.DATA_DIR || path.join(process.cwd(), 'data');
}

function statePath(): string {
  return path.join(dataRoot(), 'ops-alerts.json');
}

async function readState(): Promise<AlertsState> {
  try {
    return JSON.parse(await fs.readFile(statePath(), 'utf-8')) as AlertsState;
  } catch {
    return {};
  }
}

async function writeState(s: AlertsState): Promise<void> {
  await atomicWriteJson(statePath(), s);
}

function hoursSince(iso?: string): number {
  if (!iso) return Infinity;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return Infinity;
  return (Date.now() - t) / 3600_000;
}

/**
 * Throttled ops alerts (max 1 per type per 12h). Call from health or cron.
 */
export async function runOpsAlerts(): Promise<{ sent: string[] }> {
  if (!telegramConfigured()) return { sent: [] };
  const sent: string[] = [];
  const state = await readState();
  const throttleH = 12;

  // Backup age
  try {
    const backups = await listSiteBackups();
    const last = backups[0]?.mtime;
    const ageH = last ? (Date.now() - Date.parse(last)) / 3600_000 : Infinity;
    if (ageH > 48 && hoursSince(state.lastBackupAlertAt) >= throttleH) {
      const ok = await sendTelegramMessage(
        `⚠️ B_You ops: немає backup snapshot > 48 год` +
          (last ? ` (останній: ${new Date(last).toLocaleString('uk-UA')})` : ' (список порожній)'),
      );
      if (ok) {
        state.lastBackupAlertAt = new Date().toISOString();
        sent.push('backup');
      }
    }
  } catch {
    /* ignore */
  }

  // SMTP missing (env)
  const smtpOk = Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
  if (!smtpOk && hoursSince(state.lastSmtpAlertAt) >= throttleH) {
    const ok = await sendTelegramMessage(
      '⚠️ B_You ops: SMTP не налаштовано — листи з форм не підуть (журнали працюють).',
    );
    if (ok) {
      state.lastSmtpAlertAt = new Date().toISOString();
      sent.push('smtp');
    }
  }

  // SLA process reminder
  try {
    const [leads, orders] = await Promise.all([listLeads(), listOrders()]);
    const text = buildSlaReminder(leads, orders);
    if (text && hoursSince(state.lastSlaAlertAt) >= throttleH) {
      const ok = await sendTelegramMessage(text);
      if (ok) {
        state.lastSlaAlertAt = new Date().toISOString();
        sent.push('sla');
      }
    }
  } catch {
    /* ignore */
  }

  if (sent.length) await writeState(state);
  return { sent };
}
