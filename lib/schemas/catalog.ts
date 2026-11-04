import { z } from 'zod';

export const catalogQuerySchema = z.object({
  q: z.string().max(100).optional(),
  sort: z.enum(['manual', 'price-asc', 'price-desc', 'title-asc', 'title-desc']).optional(),
  category: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(36),
});

export const catalogLookupSchema = z.object({
  ids: z.array(z.string().min(1).max(64)).max(50),
});

export type CatalogQueryParamsInput = z.infer<typeof catalogQuerySchema>;
export type CatalogLookupInput = z.infer<typeof catalogLookupSchema>;

