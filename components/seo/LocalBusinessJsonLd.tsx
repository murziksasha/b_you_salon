import type { SiteSettings } from '@/lib/types';

interface LocalBusinessJsonLdProps {
  settings: SiteSettings;
  /** Absolute site origin, e.g. https://example.com */
  siteUrl?: string;
}

/**
 * Schema.org LocalBusiness for local SEO (Google Maps / rich results).
 */
export function LocalBusinessJsonLd({ settings, siteUrl }: LocalBusinessJsonLdProps) {
  const phones = [
    settings.headerPhone?.tel,
    ...(settings.phones || []).map((p) => p.tel),
  ].filter(Boolean);

  const uniquePhones = [...new Set(phones)];

  // Prefer locality from free-text address (e.g. «м. Чорноморськ, …»)
  let addressLocality = 'Чорноморськ';
  const localityMatch = settings.address?.match(/(?:м\.|місто)\s*([^,]+)/i);
  if (localityMatch?.[1]) {
    addressLocality = localityMatch[1].trim();
  }

  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': ['BeautySalon', 'Store'],
    name: settings.title || 'B_You',
    description: settings.description,
    image: settings.logo
      ? siteUrl
        ? new URL(settings.logo, siteUrl).toString()
        : settings.logo
      : undefined,
    url: siteUrl || undefined,
    telephone: uniquePhones.length === 1 ? uniquePhones[0] : uniquePhones[0] || undefined,
    ...(uniquePhones.length > 1
      ? {
          // Multiple lines as contact points
          contactPoint: uniquePhones.map((tel) => ({
            '@type': 'ContactPoint',
            telephone: tel,
            contactType: 'customer service',
            availableLanguage: ['uk'],
          })),
        }
      : {}),
    email: settings.email || undefined,
    address: settings.address
      ? {
          '@type': 'PostalAddress',
          streetAddress: settings.address,
          addressLocality,
          addressCountry: 'UA',
        }
      : undefined,
    openingHours: settings.hours || settings.officeHours || undefined,
    priceRange: '$$',
  };

  const clean = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;

  return (
    <script
      type='application/ld+json'
      dangerouslySetInnerHTML={{ __html: JSON.stringify(clean) }}
    />
  );
}
