import type {
  Page,
  Product,
  SalonService,
  Section,
  SiteData,
  SiteSettings,
} from './types';

const PHONE_1 = { display: '063 128 45 51', tel: '+380631284551' };
const PHONE_2 = { display: '097 703 62 83', tel: '+380977036283' };
const SHOP_PHONE = { display: '093 632 72 24', tel: '+380936327224' };

const SOCIAL = [
  {
    id: 'telegram',
    type: 'telegram' as const,
    url: 'https://t.me/+380631284551',
    icon: '/img/icons/telegram.svg',
  },
  {
    id: 'viber',
    type: 'viber' as const,
    url: 'viber://chat?number=+380631284551',
    icon: '/img/icons/viber.svg',
  },
];

const SETTINGS: SiteSettings = {
  title: 'B_You — студія краси',
  description:
    'B_You — студія краси. Салон праворуч: манікюр, педікюр, зачіски. Магазин косметики ліворуч. Be you!',
  logo: '/img/icons/logo.jpg',
  favicon: '/img/icons/logo.jpg',
  phones: [PHONE_1, PHONE_2],
  headerPhone: PHONE_1,
  shopPhone: SHOP_PHONE,
  social: SOCIAL,
  hours: 'Пн–Сб 10:00–20:00, Нд — за записом',
  address: 'Адресу уточнюйте за телефоном',
  addressNote: 'Салон — праворуч, магазин косметики — ліворуч',
  officeHours: 'Пн–Сб 10:00–20:00',
  email: '',
  mapEmbedUrl: '',
  copyright: '© B_You',
  privacyPolicyUrl: '/confident',
  privacyPolicyText: '',
  reviewsUrl: '',
};

const ADVANTAGES: Section = {
  id: 'adv-salon',
  type: 'advantages',
  visible: true,
  items: [
    {
      icon: '',
      iconAlt: '',
      textHtml: 'Один простір: <span>салон і магазин</span> поруч',
    },
    {
      icon: '',
      iconAlt: '',
      textHtml: 'Запис за <span>кілька хвилин</span> — передзвонимо',
    },
    {
      icon: '',
      iconAlt: '',
      textHtml: 'Догляд, який можна <span>забрати з собою</span>',
    },
    {
      icon: '',
      iconAlt: '',
      textHtml: 'Чоловічі та жіночі послуги <span>в одному салоні</span>',
    },
  ],
};

function zoneDoorToShop(): Section {
  return {
    id: 'door-to-shop',
    type: 'zone-door',
    visible: true,
    side: 'left',
    title: 'Магазин косметики',
    subtitle: 'Ліворуч від входу в салон — догляд, який забираєте з собою',
    href: '/shop',
    cta: 'У магазин',
    image: '/img/hero/interior.jpg',
    imageAlt: 'Магазин B_You',
  };
}

export function zoneDoorToSalon(): Section {
  return {
    id: 'door-to-salon',
    type: 'zone-door',
    visible: true,
    side: 'right',
    title: 'Салон краси',
    subtitle: 'Праворуч — манікюр, волосся, брови та вії',
    href: '/salon',
    cta: 'До салону',
    image: '/img/hero/interior.jpg',
    imageAlt: 'Салон B_You',
  };
}

function callback(id: string, title: string, serviceId?: string): Section {
  return {
    id,
    type: 'callback',
    visible: true,
    title,
    buttonText: 'Записатись',
    placeholder: '+38 (___) ___ __ __',
    ...(serviceId ? { activeServiceId: serviceId } : {}),
  };
}

const CONTACTS: Section = {
  id: 'contacts-main',
  type: 'contacts',
  visible: true,
  title: 'Контакти',
  inviteText: 'Завітайте або залиште номер — передзвонимо.',
  addressHtml:
    'Адресу уточнюйте за телефоном.<br/>Салон — праворуч, магазин косметики — ліворуч.',
  phones: [PHONE_1, PHONE_2],
  email: '',
  social: SOCIAL,
  mapEmbedUrl: '',
};

const FEEDBACK: Section = {
  id: 'feedback-salon',
  type: 'feedback',
  visible: true,
  images: [],
  quotes: [
    {
      name: 'Олена',
      text: 'Тиха атмосфера і акуратний манікюр. Зручно, що косметику можна взяти одразу біля входу.',
      service: 'Манікюр',
    },
    {
      name: 'Андрій',
      text: 'Зробив стрижку в обід — без очікування. Передзвонили за кілька хвилин після заявки.',
      service: 'Чоловічі зачіски',
    },
    {
      name: 'Марина',
      text: 'Фарбування вийшло м’яке, як просили. Салон і магазин в одному місці — дуже зручно.',
      service: 'Фарбування',
    },
  ],
  moreReviewsButtonText: 'Більше відгуків',
};

export const SALON_SERVICES: SalonService[] = [
  {
    id: 'svc-manicure',
    title: 'Манікюр',
    slug: 'manicure',
    category: 'Нігті',
    description:
      'Класичний і апаратний манікюр, покриття, укріплення. Підберемо форму і відтінок під ваш ритм.',
    priceFrom: 500,
    priceNote: 'від',
    durationMin: 60,
    image: '/img/services/manicure.jpg',
    visible: true,
  },
  {
    id: 'svc-pedicure',
    title: 'Педікюр',
    slug: 'pedicure',
    category: 'Нігті',
    description: 'Естетичний і апаратний педікюр. Комфортний догляд і акуратне покриття.',
    priceFrom: 700,
    priceNote: 'від',
    durationMin: 75,
    image: '/img/services/pedicure.jpg',
    visible: true,
  },
  {
    id: 'svc-women-hair',
    title: 'Жіночі зачіски',
    slug: 'women-hair',
    category: 'Волосся',
    description: 'Стрижка, укладка, вечірні образи. Працюємо з довжиною і густотою без агресії до волосся.',
    priceFrom: 450,
    priceNote: 'від',
    durationMin: 45,
    image: '/img/services/women-hair.jpg',
    visible: true,
  },
  {
    id: 'svc-men-hair',
    title: 'Чоловічі зачіски',
    slug: 'men-hair',
    category: 'Волосся',
    description: 'Чоловіча стрижка, оформлення бороди, укладка. Швидко і чисто.',
    priceFrom: 350,
    priceNote: 'від',
    durationMin: 30,
    image: '/img/services/men-hair.jpg',
    visible: true,
  },
  {
    id: 'svc-coloring',
    title: 'Фарбування',
    slug: 'coloring',
    category: 'Волосся',
    description: 'Тонування, складні техніки, догляд після кольору. Відтінок узгоджуємо на консультації.',
    priceFrom: 900,
    priceNote: 'від',
    durationMin: 120,
    image: '/img/services/coloring.jpg',
    visible: true,
  },
  {
    id: 'svc-brows',
    title: 'Брови та вії',
    slug: 'brows-lashes',
    category: 'Брови та вії',
    description: 'Оформлення брів, фарбування, ламінування. М’яка форма, яка тримає обличчя.',
    priceFrom: 400,
    priceNote: 'від',
    durationMin: 40,
    image: '/img/services/brows.jpg',
    visible: true,
  },
];

function servicePage(svc: SalonService): Page {
  return {
    id: `page-${svc.slug}`,
    slug: svc.slug,
    title: svc.title,
    description: svc.description,
    visible: true,
    zone: 'salon',
    sections: [
      {
        id: `hero-${svc.slug}`,
        type: 'hero',
        visible: true,
        titleHtml: svc.title,
        aboutLines: [svc.description],
        callbackTitle: 'Записатись на послугу',
        callbackButtonText: 'Записатись',
        callbackPlaceholder: '+38 (___) ___ __ __',
        image: svc.image,
        imageAlt: svc.title,
        activeServiceSlug: svc.slug,
      },
      {
        id: `price-${svc.slug}`,
        type: 'price-list',
        visible: true,
        title: 'Орієнтовна вартість',
        source: 'catalog',
        category: svc.category,
      },
      callback(`cb-${svc.slug}`, 'Залиште номер — узгодимо час', svc.id),
      zoneDoorToShop(),
    ],
  };
}

const HOME: Page = {
  id: 'home',
  slug: '',
  title: 'B_You — Be you!',
  description: SETTINGS.description,
  visible: true,
  zone: 'home',
  sections: [
    {
      id: 'doors',
      type: 'doors-hero',
      visible: true,
      image: '/img/hero/interior.jpg',
      imageAlt: 'Інтер’єр студії B_You',
      kicker: 'Be you!',
      title: 'B_You',
      subtitle: 'студія краси · салон праворуч · магазин косметики ліворуч',
      left: {
        label: 'Ліворуч',
        title: 'Магазин косметики',
        subtitle: 'Догляд, який забираєте з собою',
        href: '/shop',
        cta: 'У магазин',
      },
      right: {
        label: 'Праворуч',
        title: 'Салон краси',
        subtitle: 'Манікюр, педікюр, зачіски',
        href: '/salon',
        cta: 'До салону',
      },
    },
    {
      ...CONTACTS,
      id: 'contacts-home',
      inviteText: 'Один простір — два входи.',
    },
  ],
};

const SALON: Page = {
  id: 'page-salon',
  slug: 'salon',
  title: 'Салон краси',
  description: 'Манікюр, педікюр, жіночі та чоловічі зачіски, фарбування, брови та вії.',
  visible: true,
  zone: 'salon',
  sections: [
    {
      id: 'hero-salon',
      type: 'hero',
      visible: true,
      titleHtml: 'Салон краси',
      aboutLines: [
        'Праворуч від входу — студія, де роблять манікюр, волосся і брови.',
        'Залиште номер — узгодимо послугу і час дзвінком.',
      ],
      callbackTitle: 'Записатись',
      callbackButtonText: 'Записатись',
      callbackPlaceholder: '+38 (___) ___ __ __',
      image: '/img/hero/interior.jpg',
      imageAlt: 'Салон B_You',
    },
    {
      id: 'grid-salon',
      type: 'services-grid',
      visible: true,
      title: 'Послуги',
      subtitle: 'Оберіть напрям — розкажемо деталі по телефону',
    },
    ADVANTAGES,
    FEEDBACK,
    callback('cb-salon', 'Записатись або проконсультуватись'),
    zoneDoorToShop(),
    { ...CONTACTS, id: 'contacts-salon' },
  ],
};

const SHOP: Page = {
  id: 'page-shop',
  slug: 'shop',
  title: 'Магазин косметики',
  description: 'Догляд для обличчя, волосся, тіла та нігтів. Самовивіз у B_You або доставка за домовленістю.',
  visible: true,
  zone: 'shop',
  sections: [
    {
      id: 'hero-shop',
      type: 'hero',
      visible: true,
      titleHtml: 'Магазин косметики',
      aboutLines: [
        'Ліворуч від входу в салон.',
        'Додайте товари в кошик — менеджер підтвердить наявність і спосіб отримання.',
      ],
      callbackTitle: 'Запитати про товар',
      callbackButtonText: 'Передзвоніть',
      callbackPlaceholder: '+38 (___) ___ __ __',
      image: '/img/shop/serum.jpg',
      imageAlt: 'Косметика B_You',
    },
  ],
};

const PRIVACY: Page = {
  id: 'page-privacy',
  slug: 'confident',
  title: 'Політика конфіденційності',
  description: 'Як B_You обробляє персональні дані клієнтів і відвідувачів сайту',
  visible: true,
  zone: 'home',
  sections: [],
  contentHtml: `<div class="wrapper content-page">
  <h1>Політика конфіденційності</h1>
  <p>Ця Політика описує, як студія краси B_You обробляє персональні дані відвідувачів сайту та клієнтів.</p>
  <h2>1. Які дані ми збираємо</h2>
  <ul>
    <li>номер телефону, ім’я та коментар із форми запису або замовлення;</li>
    <li>обрана послуга, склад кошика, спосіб отримання (самовивіз / доставка) та адреса доставки, якщо ви її вказали;</li>
    <li>технічні дані запиту: IP, User-Agent, сторінка, UTM-мітки (для якості сервісу та захисту від спаму);</li>
    <li>cookie сесії адміністратора (лише для входу в адмінку).</li>
  </ul>
  <h2>2. Мета обробки</h2>
  <p>Зв’язок щодо запису в салон або замовлення з магазину, облік заявок, покращення роботи сайту, запобігання зловживанням.</p>
  <h2>3. Зберігання</h2>
  <p>Заявки зберігаються локально в журналі студії. Доступ мають лише уповноважені оператори.</p>
  <h2>4. Контакти</h2>
  <p>З питань персональних даних телефонуйте: 063 128 45 51.</p>
</div>`,
};

function product(p: Omit<Product, 'visible'> & { visible?: boolean }): Product {
  return { visible: true, inStock: true, ...p };
}

const GOODS: Product[] = [
  product({
    id: 'p-serum',
    title: 'Сироватка Glow Drops',
    description: 'Легка сироватка для сяйва шкіри. Відтінок/об’єм уточніть у коментарі до замовлення.',
    price: 890,
    image: '/img/shop/serum.jpg',
    category: 'Догляд обличчя',
    code: 'BY-SER-01',
    badge: 'hit',
    promoText: 'Хіт догляду',
  }),
  product({
    id: 'p-cream',
    title: 'Крем Silk Barrier',
    description: 'Насичений крем з м’якою текстурою. Для вечірнього ритуалу.',
    price: 760,
    image: '/img/shop/cream.jpg',
    category: 'Догляд обличчя',
    code: 'BY-CRM-02',
    badge: 'new',
  }),
  product({
    id: 'p-toner',
    title: 'Тонер Petal Mist',
    description: 'Зволожувальний тонер. Немає в наявності — можна залишити запит у коментарі.',
    price: 520,
    image: '/img/shop/toner.jpg',
    category: 'Догляд обличчя',
    code: 'BY-TNR-03',
    inStock: false,
  }),
  product({
    id: 'p-spf',
    title: 'Флюїд SPF Soft Veil',
    description: 'Легкий денний флюїд. Нанесіть як фініш догляду.',
    price: 640,
    image: '/img/shop/spf.jpg',
    category: 'Догляд обличчя',
    code: 'BY-SPF-04',
  }),
  product({
    id: 'p-shampoo',
    title: 'Шампунь Quiet Cleanse',
    description: 'Делікатне очищення для фарбованого волосся.',
    price: 480,
    image: '/img/shop/shampoo.jpg',
    category: 'Волосся',
    code: 'BY-SH-05',
  }),
  product({
    id: 'p-mask',
    title: 'Маска Silk Repair',
    description: 'Інтенсивна маска після фарбування. Час витримки — 5–10 хвилин.',
    price: 610,
    image: '/img/shop/mask.jpg',
    category: 'Волосся',
    code: 'BY-MSK-06',
    badge: 'sale',
    promoText: 'Догляд після кольору',
  }),
  product({
    id: 'p-oil',
    title: 'Олія для кінчиків Amber Glow',
    description: 'Кілька крапель на вологі кінчики. Не обтяжує.',
    price: 540,
    image: '/img/shop/oil.jpg',
    category: 'Волосся',
    code: 'BY-OIL-07',
  }),
  product({
    id: 'p-body',
    title: 'Олія для тіла Warm Milk',
    description: 'Суха олія з теплим шлейфом. Для після душу.',
    price: 720,
    image: '/img/shop/body.jpg',
    category: 'Тіло',
    code: 'BY-BDY-08',
  }),
  product({
    id: 'p-nail',
    title: 'Олійка для кутикули Nude Care',
    description: 'Догляд між візитами в салон. Відтінок лаку — у коментарі.',
    price: 280,
    image: '/img/shop/nail.jpg',
    category: 'Нігті',
    code: 'BY-NL-09',
  }),
  product({
    id: 'p-lip',
    title: 'Помада Quiet Nude',
    description: 'Нюдовий відтінок. Конкретний тон напишіть у коментарі до замовлення.',
    price: 390,
    image: '/img/shop/lipstick.jpg',
    category: 'Декор',
    code: 'BY-LP-10',
    visible: true,
  }),
];

export const defaultSiteData: SiteData = {
  settings: SETTINGS,
  headerMenu: [
    { id: 'm-salon', label: 'Салон', href: '/salon', visible: true },
    { id: 'm-shop', label: 'Магазин', href: '/shop', visible: true },
  ],
  headerMenuSalon: [
    { id: 'ms-services', label: 'Послуги', href: '/salon', visible: true },
    { id: 'ms-manicure', label: 'Манікюр', href: '/salon/manicure', visible: true },
    { id: 'ms-hair', label: 'Волосся', href: '/salon/women-hair', visible: true },
    { id: 'ms-book', label: 'Записатись', href: '/salon#callback', visible: true },
  ],
  headerMenuShop: [
    { id: 'mh-all', label: 'Каталог', href: '/shop', visible: true },
    { id: 'mh-cart', label: 'Кошик', href: '/cart', visible: true },
  ],
  servicesNav: SALON_SERVICES.map((s) => ({
    id: `nav-${s.slug}`,
    label: s.title,
    href: `/salon/${s.slug}`,
    slug: s.slug,
    visible: true,
  })),
  shopLink: { id: 'shop-link', label: 'Магазин', href: '/shop', visible: true },
  pages: [HOME, SALON, ...SALON_SERVICES.map(servicePage), SHOP, PRIVACY],
  goods: GOODS,
  services: SALON_SERVICES,
};
