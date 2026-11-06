import { promises as fs } from 'fs';
import path from 'path';
import { atomicWriteFile, atomicWriteJson } from './atomic-write';
import { withFileMutex } from './file-mutex';
import { leadsFilePath, listLeads, purgeExpiredLeads } from './leads';
import { listOrders, purgeExpiredOrders } from './orders';
import { evaluateLeadRetention, evaluateOrderRetention } from './retention';

function dataRoot(): string {
  return process.env.DATA_DIR || path.join(process.cwd(), 'data');
}

export function retentionStateFilePath(): string {
  return path.join(dataRoot(), 'retention-state.json');
}

export interface RetentionState {
  lastRunDate: string; // YYYY-MM-DD
  lastRunAt: string;
  leadsPurged: number;
  ordersPurged: number;
  ok: boolean;
}

export interface RetentionRunResult {
  executed: boolean;
  skippedReason?: 'already_run_today' | 'backup_failed' | 'dry_run' | 'test_mode';
  dryRun?: boolean;
  leadsPurged: number;
  leadsRetained: number;
  ordersPurged: number;
  ordersRetained: number;
  backupPath?: string;
  error?: string;
}

export async function readRetentionState(): Promise<RetentionState | null> {
  try {
    const raw = await fs.readFile(retentionStateFilePath(), 'utf-8');
    return JSON.parse(raw) as RetentionState;
  } catch {
    return null;
  }
}

export async function writeRetentionState(state: RetentionState): Promise<void> {
  await atomicWriteJson(retentionStateFilePath(), state);
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export async function createPreRetentionBackup(): Promise<string> {
  const dir = path.join(dataRoot(), 'backups');
  await fs.mkdir(dir, { recursive: true });
  const lPath = leadsFilePath();

  try {
    const content = await fs.readFile(lPath, 'utf-8');
    const backupName = `leads-${stamp()}-pre-retention.json`;
    const dest = path.join(dir, backupName);
    await atomicWriteFile(dest, content, { encoding: 'utf-8' });
    const stat = await fs.stat(dest);
    if (stat.size === 0) {
      throw new Error(`Backup file ${dest} is empty`);
    }
    return dest;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') {
      return 'none (no leads.json file)';
    }
    throw new Error(`Backup gate failed: ${String(err)}`);
  }
}

export async function runDailyRetention(options: {
  dryRun?: boolean;
  force?: boolean;
  now?: number;
  backupGateFn?: () => Promise<string>;
} = {}): Promise<RetentionRunResult> {
  const lockKey = retentionStateFilePath();
  return withFileMutex(lockKey, async () => {
    const now = options.now ?? Date.now();
    const todayStr = new Date(now).toISOString().slice(0, 10);

    const currentState = await readRetentionState();
    if (!options.force && currentState?.lastRunDate === todayStr) {
      return {
        executed: false,
        skippedReason: 'already_run_today',
        leadsPurged: 0,
        leadsRetained: 0,
        ordersPurged: 0,
        ordersRetained: 0,
      };
    }

    if (options.dryRun) {
      const refDate = new Date(now);
      const leads = await listLeads().catch(() => []);
      const orders = await listOrders().catch(() => []);

      let dryLeadsPurged = 0;
      for (const l of leads) {
        if (evaluateLeadRetention(l, refDate).purgeable) dryLeadsPurged++;
      }
      let dryOrdersPurged = 0;
      for (const o of orders) {
        if (evaluateOrderRetention(o, refDate).purgeable) dryOrdersPurged++;
      }

      return {
        executed: true,
        dryRun: true,
        leadsPurged: dryLeadsPurged,
        leadsRetained: leads.length - dryLeadsPurged,
        ordersPurged: dryOrdersPurged,
        ordersRetained: orders.length - dryOrdersPurged,
      };
    }

    // Verified Backup Gate
    let backupPath: string;
    try {
      const backupFn = options.backupGateFn || createPreRetentionBackup;
      backupPath = await backupFn();
    } catch (err: unknown) {
      console.error('[retention-runner] Backup gate aborted purge:', err);
      return {
        executed: false,
        skippedReason: 'backup_failed',
        leadsPurged: 0,
        leadsRetained: 0,
        ordersPurged: 0,
        ordersRetained: 0,
        error: String(err),
      };
    }

    // Execute purge
    const leadResult = await purgeExpiredLeads(now);
    const orderResult = await purgeExpiredOrders(now);

    const nextState: RetentionState = {
      lastRunDate: todayStr,
      lastRunAt: new Date(now).toISOString(),
      leadsPurged: leadResult.purgedCount,
      ordersPurged: orderResult.purgedCount,
      ok: true,
    };
    await writeRetentionState(nextState);

    return {
      executed: true,
      backupPath,
      leadsPurged: leadResult.purgedCount,
      leadsRetained: leadResult.retainedCount,
      ordersPurged: orderResult.purgedCount,
      ordersRetained: orderResult.retainedCount,
    };
  });
}

const DEFAULT_LOOP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

type GlobalRetention = {
  __byouRetentionTimer?: ReturnType<typeof setInterval>;
};

export function startDailyRetentionLoop(intervalMs = DEFAULT_LOOP_INTERVAL_MS): void {
  const g = globalThis as GlobalRetention;
  if (g.__byouRetentionTimer) return;

  g.__byouRetentionTimer = setInterval(async () => {
    try {
      await runDailyRetention();
    } catch (err) {
      console.error('[retention-runner] Scheduled run failed:', err);
    }
  }, intervalMs);
  g.__byouRetentionTimer.unref?.();

  // Run on startup check
  void runDailyRetention().catch((err) => {
    console.error('[retention-runner] Initial check failed:', err);
  });
}

export function stopDailyRetentionLoop(): void {
  const g = globalThis as GlobalRetention;
  if (g.__byouRetentionTimer) {
    clearInterval(g.__byouRetentionTimer);
    g.__byouRetentionTimer = undefined;
  }
}
