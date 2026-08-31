const DEFAULT_FAQ = [
  {
    q: 'Як записатися в салон?',
    a: 'Залиште номер у формі на сайті або зателефонуйте. Узгодимо послугу і зручний час.',
  },
  {
    q: 'Який графік роботи?',
    a: 'Пн–Сб 10:00–20:00, неділя — за записом. Актуальні години вказані в блоці «Контакти».',
  },
  {
    q: 'Що праворуч і ліворуч у студії?',
    a: 'Праворуч — салон краси: манікюр, педікюр, зачіски, фарбування, брови. Ліворуч — магазин косметики.',
  },
  {
    q: 'Чи можна купити догляд після процедури?',
    a: 'Так, магазин поруч із салоном. Самовивіз у студії або доставка за домовленістю.',
  },
];

/** FAQPage JSON-LD for rich results (Ukrainian salon copy). */
export function FaqJsonLd({
  items = DEFAULT_FAQ,
}: {
  items?: { q: string; a: string }[];
}) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.a,
      },
    })),
  };

  return (
    <script type='application/ld+json' dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
  );
}
