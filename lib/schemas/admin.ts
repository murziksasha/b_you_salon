import { z } from 'zod';
import { ADMIN_CAPABILITIES } from '@/lib/admin-roles';

export const AdminRoleSchema = z.enum(['owner', 'editor', 'operator']);
export const CapabilitySchema = z.enum(ADMIN_CAPABILITIES);

/** Re-auth fields: `confirmPassword` (current user's password); `ownerPassword` kept as alias for one release. */
const ReAuth = {
  confirmPassword: z.string().max(256).optional(),
  ownerPassword: z.string().max(256).optional(),
};

export function reAuthPassword(body: { confirmPassword?: string; ownerPassword?: string }): string {
  return body.confirmPassword ?? body.ownerPassword ?? '';
}

export const CreateUserSchema = z.object({
  username: z.string().trim().min(2).max(32),
  password: z.string().min(8).max(256),
  role: AdminRoleSchema.optional(),
  grants: z.array(CapabilitySchema).optional(),
  ...ReAuth,
});

export const UpdateUserSchema = z.object({
  id: z.string().min(1).max(64),
  role: AdminRoleSchema.optional(),
  disabled: z.boolean().optional(),
  password: z.string().min(8).max(256).optional(),
  grants: z.array(CapabilitySchema).optional(),
  ...ReAuth,
});

export const DeleteUserSchema = z.object({
  id: z.string().min(1).max(64),
  ...ReAuth,
});

export const RevokeSessionsSchema = z.object({
  id: z.string().min(1).max(128).optional(),
  all: z.boolean().optional(),
  ...ReAuth,
});
