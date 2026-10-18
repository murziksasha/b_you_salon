import { phonesMatch } from './phone';

export type TelegramPushSkip = 'quiet' | 'open-phone';

export type TelegramPushInboxItem = {
  id: string;
  phone: string;
  open: boolean;
};

export function shouldSendTelegramPush(input: {
  kind: 'lead' | 'order' | 'ops';
  phone?: string;
  newId?: string;
  inbox?: TelegramPushInboxItem[];
  quiet: boolean;
  /** Repeat that did not create a new row (contact dedup). */
  deduped?: boolean;
}): { send: boolean; reason?: TelegramPushSkip } {
  if (input.kind === 'ops') return { send: true };
  if (input.quiet) return { send: false, reason: 'quiet' };
  if (input.deduped) return { send: false, reason: 'open-phone' };
  const phone = (input.phone || '').trim();
  if (!phone || !input.inbox?.length) return { send: true };
  const otherOpen = input.inbox.some(
    (item) => item.open && item.id !== input.newId && phonesMatch(item.phone, phone),
  );
  if (otherOpen) return { send: false, reason: 'open-phone' };
  return { send: true };
}
