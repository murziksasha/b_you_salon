export type BreadcrumbItem = {
  name: string;
  path: string;
};

export function BreadcrumbJsonLd({
  items,
  siteUrl,
}: {
  items: BreadcrumbItem[];
  siteUrl?: string;
}) {
  const origin = siteUrl?.replace(/\/$/, '') || '';
  const data = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: origin ? `${origin}${item.path}` : item.path,
    })),
  };

  return (
    <script type='application/ld+json' dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
  );
}
