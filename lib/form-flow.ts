import type { ZoneId } from './types';
import { zoneFromPath } from './zone';

export type FormIntent = 'salon' | 'shop' | '';
export type FormFlow = 'booking' | 'sales' | 'callback';

export function parseFormIntent(raw: unknown): FormIntent {
  const v = typeof raw === 'string' ? raw.trim() : '';
  if (v === 'salon' || v === 'shop') return v;
  return '';
}

/** Public callback/contact forms: salon booking vs shop sale vs generic callback. */
export function resolveFormFlow(opts: { pagePath?: string; intent?: unknown }): FormFlow {
  const intent = parseFormIntent(opts.intent);
  if (intent === 'shop') return 'sales';
  if (intent === 'salon') return 'booking';
  const zone = zoneFromPath(opts.pagePath || '/');
  if (zone === 'shop') return 'sales';
  if (zone === 'salon') return 'booking';
  return 'callback';
}

export function resolveLeadSource(flow: FormFlow): 'booking' | 'callback' {
  return flow === 'booking' ? 'booking' : 'callback';
}

export function resolveLeadZone(pagePath: string, intent: FormIntent): ZoneId {
  if (intent === 'salon') return 'salon';
  if (intent === 'shop') return 'shop';
  return zoneFromPath(pagePath || '/');
}
