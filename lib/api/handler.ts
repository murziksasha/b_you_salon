import { NextResponse, type NextRequest } from 'next/server';
import type { z } from 'zod';
import type { AdminCapability } from '@/lib/admin-roles';
import { requireAdminRole, type AdminAccess } from '@/lib/require-role';

/** Uniform error body: `error` stays a string for backward compatibility; `code` is machine-readable. */
export function apiError(status: number, code: string, message?: string, details?: unknown) {
  return NextResponse.json({ error: message || code, code, ...(details !== undefined ? { details } : {}) }, { status });
}

export type AdminCtx<B> = { req: NextRequest; access: AdminAccess; body: B };

type Capability = AdminCapability | 'stats';

/**
 * Wrap an admin route handler: IP + session + capability, optional Zod body validation,
 * and a catch-all that logs and returns 500 instead of leaking stack traces.
 */
export function withAdmin<S extends z.ZodType | null = null>(
  capability: Capability | null,
  schema: S,
  fn: (ctx: AdminCtx<S extends z.ZodType ? z.infer<S> : undefined>) => Promise<Response>,
) {
  return async (req: NextRequest): Promise<Response> => {
    const gate = await requireAdminRole(capability ?? undefined);
    if (!gate.ok) return gate.response;
    const { ok: _ok, ...access } = gate;
    let body: unknown = undefined;
    if (schema) {
      const raw = await req.json().catch(() => undefined);
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        return apiError(400, 'validation', 'Bad request', parsed.error.issues);
      }
      body = parsed.data;
    }
    try {
      return await fn({ req, access, body: body as S extends z.ZodType ? z.infer<S> : undefined });
    } catch (err) {
      console.error('[api]', req.method, req.nextUrl?.pathname, err);
      return apiError(500, 'internal', 'Internal error');
    }
  };
}
