/** Shared workflow for leads & orders (backward-compatible with `handled`). */

export const WORKFLOW_STATUSES = [
  'new',
  'called',
  'waiting',
  'in_progress',
  'done',
  'spam',
  'no_answer',
] as const;

export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

export const WORKFLOW_LABELS: Record<WorkflowStatus, string> = {
  new: 'Нова',
  called: 'Дзвонили',
  waiting: 'Очікує',
  in_progress: 'В роботі',
  done: 'Готово',
  spam: 'Спам',
  no_answer: 'Не взяв',
};

/** Close outcomes — required when moving to closed-like statuses. */
export const CLOSE_OUTCOMES = [
  'deal',
  'quoted',
  'no_answer',
  'wrong_number',
  'spam',
  'refused',
  'other',
] as const;

export type CloseOutcome = (typeof CLOSE_OUTCOMES)[number];

export const CLOSE_OUTCOME_LABELS: Record<CloseOutcome, string> = {
  deal: 'Домовленість / запис',
  quoted: 'Оцінка / ціна озвучена',
  no_answer: 'Не відповідає',
  wrong_number: 'Помилковий номер',
  spam: 'Спам',
  refused: 'Відмова',
  other: 'Інше',
};

export function isCloseOutcome(v: unknown): v is CloseOutcome {
  return typeof v === 'string' && (CLOSE_OUTCOMES as readonly string[]).includes(v);
}

/** Statuses that require outcome + note when set. */
export function statusRequiresOutcome(status: WorkflowStatus): boolean {
  return status === 'done' || status === 'spam' || status === 'no_answer';
}

/** Statuses that still need operator attention. */
export const OPEN_WORKFLOW_STATUSES: WorkflowStatus[] = [
  'new',
  'called',
  'waiting',
  'in_progress',
  'no_answer',
];

export function isWorkflowStatus(v: unknown): v is WorkflowStatus {
  return typeof v === 'string' && (WORKFLOW_STATUSES as readonly string[]).includes(v);
}

export function isOpenStatus(status: WorkflowStatus): boolean {
  return OPEN_WORKFLOW_STATUSES.includes(status);
}

export function isClosedStatus(status: WorkflowStatus): boolean {
  return status === 'done' || status === 'spam';
}

export function statusFromHandled(handled: boolean): WorkflowStatus {
  return handled ? 'done' : 'new';
}

export function normalizeStatus(status: unknown, handled?: boolean): WorkflowStatus {
  if (isWorkflowStatus(status)) return status;
  return statusFromHandled(Boolean(handled));
}

export function handledFromStatus(status: WorkflowStatus): boolean {
  return isClosedStatus(status);
}

export function isStaleOpen(createdAt: string, status: WorkflowStatus, hours = 1): boolean {
  if (!isOpenStatus(status)) return false;
  const t = Date.parse(createdAt);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t > hours * 60 * 60 * 1000;
}

export function isVeryStaleOpen(createdAt: string, status: WorkflowStatus): boolean {
  return isStaleOpen(createdAt, status, 24);
}

export function statusBadgeClass(status: WorkflowStatus): string {
  switch (status) {
    case 'new':
      return 'admin-wf-badge admin-wf-badge--new';
    case 'called':
      return 'admin-wf-badge admin-wf-badge--called';
    case 'waiting':
      return 'admin-wf-badge admin-wf-badge--waiting';
    case 'in_progress':
      return 'admin-wf-badge admin-wf-badge--called';
    case 'done':
      return 'admin-wf-badge admin-wf-badge--done';
    case 'spam':
      return 'admin-wf-badge admin-wf-badge--spam';
    case 'no_answer':
      return 'admin-wf-badge admin-wf-badge--no-answer';
    default:
      return 'admin-wf-badge';
  }
}

/** Validate close: need outcome + non-empty note for closed statuses. */
export function validateClosePatch(input: {
  status?: WorkflowStatus;
  outcome?: string;
  note?: string;
}): string | null {
  if (!input.status || !statusRequiresOutcome(input.status)) return null;
  if (!isCloseOutcome(input.outcome)) {
    return 'Оберіть результат закриття (outcome)';
  }
  if (!(input.note || '').trim()) {
    return 'Додайте нотатку при закритті';
  }
  return null;
}
