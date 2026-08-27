const DEFAULT_FAQ = [
  {
    q: 'Скільки коштує діагностика?',
    a: 'Первинна консультація та оцінка несправності — уточнюйте по телефону. Часто діагностика безкоштовна при подальшому ремонті.',
  },
  {
    q: 'Який термін ремонту?',
    a: 'Залежить від несправності та наявності запчастин. Багато типових робіт виконуємо протягом 1–3 робочих днів.',
  },
  {
    q: 'Чи є гарантія на ремонт?',
    a: 'Так, на виконані роботи та встановлені запчастини надаємо гарантію. Умови озвучуємо перед початком робіт.',
  },
  {
    q: 'Де ви знаходитесь?',
    a: 'м. Чорноморськ. Адреса та години роботи вказані в блоці «Контакти» на сайті.',
  },
];

/** FAQPage JSON-LD for rich results. */
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
