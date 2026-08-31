import { z } from 'zod';
import type { SiteData } from './types';

const phoneEntrySchema = z.object({
  display: z.string(),
  tel: z.string(),
});

const socialLinkSchema = z.object({
  id: z.string(),
  type: z.string(),
  url: z.string(),
  icon: z.string(),
});

const menuItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  href: z.string(),
  visible: z.boolean(),
});

const serviceNavItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  href: z.string(),
  slug: z.string(),
  visible: z.boolean(),
});

const productSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  price: z.number(),
  image: z.string(),
  images: z.array(z.string()).optional(),
  video: z.string().optional(),
  visible: z.boolean(),
  category: z.string().optional(),
  /** Optional; empty/undefined OK. Non-empty must be ≥2 chars after trim (enforced on save). */
  code: z
    .string()
    .optional()
    .refine((v) => v == null || v.trim() === '' || v.trim().length >= 2, {
      message: 'Product code must be at least 2 characters when set',
    }),
  inStock: z.boolean().optional(),
  badge: z.string().optional(),
  promoText: z.string().optional(),
  sortPin: z.boolean().optional(),
  relatedIds: z.array(z.string()).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

const sectionBase = {
  id: z.string(),
  visible: z.boolean(),
  hideOnMobile: z.boolean().optional(),
  hideOnDesktop: z.boolean().optional(),
};

const sectionSchema = z
  .object({
    ...sectionBase,
    type: z.string(),
  })
  .passthrough();

const pageDraftSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    sections: z.array(sectionSchema).optional(),
    contentHtml: z.string().optional(),
    titleSize: z.number().optional(),
    textScale: z.number().optional(),
    updatedAt: z.string().optional(),
  })
  .optional();

const salonServiceSchema = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string(),
  category: z.string(),
  description: z.string(),
  priceFrom: z.number(),
  priceNote: z.string().optional(),
  durationMin: z.number().optional(),
  image: z.string(),
  images: z.array(z.string()).optional(),
  visible: z.boolean(),
  sortPin: z.boolean().optional(),
});

const pageSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  visible: z.boolean(),
  zone: z.enum(['home', 'salon', 'shop']).optional(),
  sections: z.array(sectionSchema),
  contentHtml: z.string().optional(),
  titleSize: z.number().optional(),
  textScale: z.number().optional(),
  draft: pageDraftSchema,
  publishAt: z.string().optional(),
  reviewRequested: z.boolean().optional(),
  reviewRequestedAt: z.string().optional(),
  reviewRequestedBy: z.string().optional(),
});

const settingsSchema = z
  .object({
    title: z.string(),
    description: z.string(),
    logo: z.string(),
    favicon: z.string(),
    phones: z.array(phoneEntrySchema),
    headerPhone: phoneEntrySchema,
    shopPhone: phoneEntrySchema.optional(),
    social: z.array(socialLinkSchema),
    hours: z.string(),
    address: z.string(),
    addressNote: z.string(),
    officeHours: z.string(),
    email: z.string(),
    mapEmbedUrl: z.string(),
    copyright: z.string(),
    privacyPolicyUrl: z.string(),
    privacyPolicyText: z.string(),
    reviewsUrl: z.string().optional(),
    ogImage: z.string().optional(),
  })
  .passthrough();

export const siteDataSchema = z.object({
  settings: settingsSchema,
  headerMenu: z.array(menuItemSchema),
  headerMenuSalon: z.array(menuItemSchema).optional(),
  headerMenuShop: z.array(menuItemSchema).optional(),
  servicesNav: z.array(serviceNavItemSchema),
  shopLink: menuItemSchema.optional(),
  pages: z.array(pageSchema),
  goods: z.array(productSchema),
  services: z.array(salonServiceSchema).optional(),
  updatedAt: z.string().optional(),
});

export type SiteDataValidated = z.infer<typeof siteDataSchema>;

export function parseSiteData(input: unknown):
  | { success: true; data: SiteData }
  | { success: false; error: string } {
  const result = siteDataSchema.safeParse(input);
  if (!result.success) {
    const msg = result.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
      .join('; ');
    return { success: false, error: msg || 'Invalid site data' };
  }
  return { success: true, data: result.data as SiteData };
}
