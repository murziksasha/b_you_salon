import { z } from 'zod';
import type { SiteData } from './types';

const str = (max: number) => z.string().max(max);
const strOpt = (max: number) => z.string().max(max).optional();

export const MAX_NOTE = 4000;
export const MAX_ALT = 300;
export const MAX_TAG = 40;
export const MAX_TAGS = 20;

const phoneEntrySchema = z.object({
  display: str(80),
  tel: str(40),
});

const socialLinkSchema = z.object({
  id: str(80),
  type: str(40),
  url: str(2000),
  icon: str(2000),
});

const menuItemSchema = z.object({
  id: str(80),
  label: str(200),
  href: str(2000),
  visible: z.boolean(),
});

const serviceNavItemSchema = z.object({
  id: str(80),
  label: str(200),
  href: str(2000),
  slug: str(80),
  visible: z.boolean(),
});

const productSchema = z.object({
  id: str(80),
  title: str(300),
  description: str(20_000),
  price: z.number(),
  image: str(2000),
  images: z.array(str(2000)).max(30).optional(),
  video: strOpt(2000),
  visible: z.boolean(),
  category: strOpt(120),
  /** Optional; empty/undefined OK. Non-empty must be ≥2 chars after trim (enforced on save). */
  code: strOpt(80).refine(v => v == null || v.trim() === '' || v.trim().length >= 2, {
    message: 'Product code must be at least 2 characters when set',
  }),
  inStock: z.boolean().optional(),
  badge: strOpt(40),
  promoText: strOpt(500),
  sortPin: z.boolean().optional(),
  relatedIds: z.array(str(80)).max(20).optional(),
  createdAt: strOpt(40),
  updatedAt: strOpt(40),
});

const doorHalfSchema = z.object({
  label: str(200),
  title: str(300),
  subtitle: str(1000),
  href: str(2000),
  cta: str(200),
  image: strOpt(2000),
});

const sectionItemSchema = z.union([
  str(2000),
  z.object({
    icon: strOpt(2000),
    iconAlt: strOpt(500),
    textHtml: strOpt(5000),
    href: strOpt(2000),
    image: strOpt(2000),
    imageAlt: strOpt(500),
    label: strOpt(300),
  }),
]);

/** Known CMS section fields only — unknown keys are stripped (no passthrough). */
const sectionSchema = z.object({
  id: str(80),
  type: str(40),
  visible: z.boolean(),
  hideOnMobile: z.boolean().optional(),
  hideOnDesktop: z.boolean().optional(),
  titleHtml: strOpt(50_000),
  aboutLines: z.array(str(2000)).max(20).optional(),
  callbackTitle: strOpt(500),
  callbackTitleHtml: strOpt(5000),
  callbackButtonText: strOpt(200),
  callbackButtonHtml: strOpt(2000),
  callbackPlaceholder: strOpt(200),
  image: strOpt(2000),
  imageAlt: strOpt(500),
  imageClass: strOpt(200),
  activeServiceSlug: strOpt(80),
  kicker: strOpt(200),
  title: strOpt(500),
  subtitle: strOpt(2000),
  left: doorHalfSchema.optional(),
  right: doorHalfSchema.optional(),
  side: z.enum(['left', 'right']).optional(),
  href: strOpt(2000),
  cta: strOpt(200),
  activeSlug: strOpt(80),
  items: z.array(sectionItemSchema).max(100).optional(),
  intro: strOpt(5000),
  images: z.array(str(2000)).max(50).optional(),
  quotes: z
    .array(
      z.object({
        name: str(200),
        text: str(5000),
        service: strOpt(200),
      }),
    )
    .max(50)
    .optional(),
  moreReviewsButtonText: strOpt(200),
  inviteText: strOpt(2000),
  addressHtml: strOpt(5000),
  phones: z.array(phoneEntrySchema).max(10).optional(),
  email: strOpt(200),
  social: z.array(socialLinkSchema).max(20).optional(),
  mapEmbedUrl: strOpt(5000),
  buttonText: strOpt(200),
  buttonHtml: strOpt(2000),
  placeholder: strOpt(200),
  activeServiceId: strOpt(80),
  category: strOpt(120),
  limit: z.number().optional(),
  source: z.enum(['catalog', 'manual']).optional(),
  groups: z
    .array(
      z.object({
        title: str(300),
        items: z
          .array(
            z.object({
              title: str(300),
              price: str(80),
              note: strOpt(500),
            }),
          )
          .max(100),
      }),
    )
    .max(50)
    .optional(),
  html: strOpt(100_000),
});

const pageDraftSchema = z
  .object({
    title: strOpt(300),
    description: strOpt(5000),
    sections: z.array(sectionSchema).max(80).optional(),
    contentHtml: strOpt(100_000),
    titleSize: z.number().optional(),
    textScale: z.number().optional(),
    updatedAt: strOpt(40),
  })
  .optional();

const salonServiceSchema = z.object({
  id: str(80),
  title: str(300),
  slug: str(80),
  category: str(120),
  description: str(20_000),
  priceFrom: z.number(),
  priceNote: strOpt(500),
  durationMin: z.number().optional(),
  image: str(2000),
  images: z.array(str(2000)).max(30).optional(),
  visible: z.boolean(),
  sortPin: z.boolean().optional(),
});

export const pageSchema = z.object({
  id: str(80),
  slug: str(120),
  title: str(300),
  description: str(5000),
  visible: z.boolean(),
  zone: z.enum(['home', 'salon', 'shop']).optional(),
  sections: z.array(sectionSchema).max(80),
  contentHtml: strOpt(100_000),
  titleSize: z.number().optional(),
  textScale: z.number().optional(),
  draft: pageDraftSchema,
  publishAt: strOpt(40),
  reviewRequested: z.boolean().optional(),
  reviewRequestedAt: strOpt(40),
  reviewRequestedBy: strOpt(64),
});

const settingsSchema = z.object({
  title: str(300),
  description: str(5000),
  logo: str(2000),
  favicon: str(2000),
  phones: z.array(phoneEntrySchema).max(10),
  headerPhone: phoneEntrySchema,
  shopPhone: phoneEntrySchema.optional(),
  social: z.array(socialLinkSchema).max(20),
  hours: str(300),
  address: str(500),
  addressNote: str(500),
  officeHours: str(300),
  email: str(200),
  mapEmbedUrl: str(5000),
  copyright: str(300),
  privacyPolicyUrl: str(2000),
  privacyPolicyText: str(50_000),
  reviewsUrl: strOpt(2000),
  ogImage: strOpt(2000),
});

export const siteDataSchema = z.object({
  settings: settingsSchema,
  headerMenu: z.array(menuItemSchema).max(40),
  headerMenuSalon: z.array(menuItemSchema).max(40).optional(),
  headerMenuShop: z.array(menuItemSchema).max(40).optional(),
  servicesNav: z.array(serviceNavItemSchema).max(40),
  shopLink: menuItemSchema.optional(),
  pages: z.array(pageSchema).max(80),
  goods: z.array(productSchema).max(500),
  services: z.array(salonServiceSchema).max(200).optional(),
  updatedAt: strOpt(40),
});

export type SiteDataValidated = z.infer<typeof siteDataSchema>;

export function parseSiteData(input: unknown): { success: true; data: SiteData } | { success: false; error: string } {
  const result = siteDataSchema.safeParse(input);
  if (!result.success) {
    const msg = result.error.issues
      .slice(0, 5)
      .map(i => `${i.path.join('.') || 'root'}: ${i.message}`)
      .join('; ');
    return { success: false, error: msg || 'Invalid site data' };
  }
  return { success: true, data: result.data as SiteData };
}

function formatZodError(err: z.ZodError): string {
  return err.issues
    .slice(0, 5)
    .map(i => `${i.path.join('.') || 'root'}: ${i.message}`)
    .join('; ');
}

export function isIsoDatetime(value: string): boolean {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return false;
  return Number.isFinite(Date.parse(value));
}

const isoOrEmpty = str(40).refine(v => isIsoDatetime(v), { message: 'Must be ISO-8601 datetime' });

export const leadPatchBodySchema = z.object({
  id: str(80).min(1),
  handled: z.boolean().optional(),
  note: str(MAX_NOTE).optional(),
  status: str(40).optional(),
  callbackAt: isoOrEmpty.optional(),
  outcome: str(40).optional(),
  assignee: str(64).optional(),
});

export const orderPatchBodySchema = z.object({
  id: str(80).min(1),
  handled: z.boolean().optional(),
  note: str(MAX_NOTE).optional(),
  status: str(40).optional(),
  callbackAt: isoOrEmpty.optional(),
  outcome: str(40).optional(),
  assignee: str(64).optional(),
});

export const mediaPatchBodySchema = z.object({
  name: str(200).optional(),
  names: z.array(str(200)).max(200).optional(),
  purpose: str(40).optional(),
  tags: z.union([z.array(str(MAX_TAG)).max(MAX_TAGS), str(400)]).optional(),
  alt: str(MAX_ALT).optional(),
  focusX: z.number().optional(),
  focusY: z.number().optional(),
  folderId: str(80).optional(),
  sortOrder: z.number().optional(),
  orderedNames: z.array(str(200)).max(500).optional(),
  reorderFolderId: str(80).optional(),
});

export const previewPostBodySchema = z.object({
  page: pageSchema,
});

export function parseOrError<T>(
  schema: z.ZodType<T>,
  input: unknown,
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(input);
  if (!result.success) return { success: false, error: formatZodError(result.error) };
  return { success: true, data: result.data };
}
