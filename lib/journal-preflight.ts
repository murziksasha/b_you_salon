import { promises as fs } from 'fs';
import path from 'path';
import { leadSchema } from './leads';
import { orderSchema } from './orders';
import { siteDataSchema } from './validation';

export interface JournalIssue {
  recordId?: string;
  recordIndex?: number;
  path: string;
  message: string;
}

export interface PreflightFileResult {
  file: string;
  exists: boolean;
  valid: boolean;
  recordCount: number;
  issues: JournalIssue[];
}

export interface PreflightReport {
  ok: boolean;
  totalRecords: number;
  totalErrors: number;
  site: PreflightFileResult;
  leads: PreflightFileResult;
  orders: PreflightFileResult;
}

export async function validateSiteFile(filePath: string): Promise<PreflightFileResult> {
  const result: PreflightFileResult = {
    file: filePath,
    exists: false,
    valid: false,
    recordCount: 0,
    issues: [],
  };

  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf-8');
    result.exists = true;
  } catch (err: unknown) {
    result.issues.push({ path: 'file', message: `Cannot read file: ${String(err)}` });
    return result;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: unknown) {
    result.issues.push({ path: 'json', message: `JSON parse error: ${String(err)}` });
    return result;
  }

  const parsedResult = siteDataSchema.safeParse(parsed);
  if (!parsedResult.success) {
    for (const issue of parsedResult.error.issues) {
      result.issues.push({
        path: issue.path.join('.') || 'root',
        message: issue.message,
      });
    }
    return result;
  }

  const site = parsedResult.data;
  const count = (site.pages?.length || 0) + (site.goods?.length || 0) + (site.services?.length || 0);
  result.recordCount = count;
  result.valid = true;
  return result;
}

export async function validateLeadsFile(filePath: string): Promise<PreflightFileResult> {
  const result: PreflightFileResult = {
    file: filePath,
    exists: false,
    valid: false,
    recordCount: 0,
    issues: [],
  };

  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf-8');
    result.exists = true;
  } catch (err: unknown) {
    result.issues.push({ path: 'file', message: `Cannot read file: ${String(err)}` });
    return result;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: unknown) {
    result.issues.push({ path: 'json', message: `JSON parse error: ${String(err)}` });
    return result;
  }

  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { leads?: unknown }).leads)) {
    result.issues.push({ path: 'leads', message: 'Expected object with leads array' });
    return result;
  }

  const leads = (parsed as { leads: unknown[] }).leads;
  result.recordCount = leads.length;

  for (let idx = 0; idx < leads.length; idx++) {
    const item = leads[idx];
    const parseResult = leadSchema.safeParse(item);
    if (!parseResult.success) {
      const id = item && typeof item === 'object' && 'id' in item ? String((item as { id: unknown }).id) : undefined;
      for (const issue of parseResult.error.issues) {
        result.issues.push({
          recordId: id,
          recordIndex: idx,
          path: issue.path.join('.') || 'root',
          message: issue.message,
        });
      }
    }
  }

  result.valid = result.issues.length === 0;
  return result;
}

export async function validateOrdersFile(filePath: string): Promise<PreflightFileResult> {
  const result: PreflightFileResult = {
    file: filePath,
    exists: false,
    valid: false,
    recordCount: 0,
    issues: [],
  };

  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf-8');
    result.exists = true;
  } catch (err: unknown) {
    result.issues.push({ path: 'file', message: `Cannot read file: ${String(err)}` });
    return result;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: unknown) {
    result.issues.push({ path: 'json', message: `JSON parse error: ${String(err)}` });
    return result;
  }

  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { orders?: unknown }).orders)) {
    result.issues.push({ path: 'orders', message: 'Expected object with orders array' });
    return result;
  }

  const orders = (parsed as { orders: unknown[] }).orders;
  result.recordCount = orders.length;

  for (let idx = 0; idx < orders.length; idx++) {
    const item = orders[idx];
    const parseResult = orderSchema.safeParse(item);
    if (!parseResult.success) {
      const id = item && typeof item === 'object' && 'id' in item ? String((item as { id: unknown }).id) : undefined;
      for (const issue of parseResult.error.issues) {
        result.issues.push({
          recordId: id,
          recordIndex: idx,
          path: issue.path.join('.') || 'root',
          message: issue.message,
        });
      }
    }
  }

  result.valid = result.issues.length === 0;
  return result;
}

export async function validateJournalsDir(
  dirPath: string,
  options: { requireAll?: boolean } = {},
): Promise<PreflightReport> {
  const sitePath = path.join(dirPath, 'site.json');
  const leadsPath = path.join(dirPath, 'leads.json');
  const ordersPath = path.join(dirPath, 'orders.json');

  const [site, leads, orders] = await Promise.all([
    validateSiteFile(sitePath),
    validateLeadsFile(leadsPath),
    validateOrdersFile(ordersPath),
  ]);

  if (!options.requireAll) {
    if (!leads.exists && leads.issues.length === 1 && leads.issues[0].message.includes('ENOENT')) {
      leads.issues = [];
      leads.valid = true;
    }
    if (!orders.exists && orders.issues.length === 1 && orders.issues[0].message.includes('ENOENT')) {
      orders.issues = [];
      orders.valid = true;
    }
  }

  const totalErrors = site.issues.length + leads.issues.length + orders.issues.length;
  const ok = site.valid && leads.valid && orders.valid;
  const totalRecords = site.recordCount + leads.recordCount + orders.recordCount;

  return {
    ok,
    totalRecords,
    totalErrors,
    site,
    leads,
    orders,
  };
}

