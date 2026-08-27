/**
 * Seed realistic UA catalog goods + full privacy policy into data/site.json
 */
import { readFileSync, writeFileSync } from 'fs';
import { randomBytes } from 'crypto';

const p = 'data/site.json';
const data = JSON.parse(readFileSync(p, 'utf8'));

function id() {
  return randomBytes(6).toString('hex');
}

const privacyHtml = `
<div class="wrapper" style="padding:40px 20px;max-width:800px;margin:0 auto">
  <h1 class="_title">Політика конфіденційності персональних даних</h1>
  <p class="_paragr">Ця Політика описує, як Proper Service (далі — «Сервіс») обробляє персональні дані відвідувачів сайту та клієнтів.</p>
  <h2>1. Які дані ми збираємо</h2>
  <ul>
    <li>номер телефону, залишений у формі зворотного дзвінка або замовлення;</li>
    <li>коментар до замовлення (за бажанням);</li>
    <li>технічні дані запиту: IP, User-Agent, сторінка, UTM-мітки (для якості сервісу та захисту від спаму);</li>
    <li>cookie сесії адміністратора (лише для входу в адмінку).</li>
  </ul>
  <h2>2. Мета обробки</h2>
  <p class="_paragr">Зв’язок з клієнтом щодо ремонту / замовлення, облік заявок, покращення роботи сайту, запобігання зловживанням.</p>
  <h2>3. Зберігання</h2>
  <p class="_paragr">Заявки зберігаються локально в журналі Сервісу. Доступ мають лише уповноважені оператори. Термін зберігання — до виконання запиту та обґрунтованого архіву, але не довше ніж потрібно для мети обробки.</p>
  <h2>4. Передача третім особам</h2>
  <p class="_paragr">Дані можуть передаватися постачальникам послуг зв’язку (SMTP, Telegram) виключно для доставки сповіщень про заявку. Ми не продаємо персональні дані.</p>
  <h2>5. Ваші права</h2>
  <p class="_paragr">Ви можете звернутися з проханням виправити або видалити дані, написавши на email з розділу контактів сайту або зателефонувавши.</p>
  <h2>6. Безпека</h2>
  <p class="_paragr">Застосовуємо обмеження доступу до адмінки, rate-limit форм, honeypot від ботів. Рекомендуємо використовувати HTTPS у production.</p>
  <h2>7. Зміни</h2>
  <p class="_paragr">Ми можемо оновлювати цю політику. Актуальна версія завжди доступна на цій сторінці.</p>
  <p class="_paragr"><em>Оновлено: ${new Date().toISOString().slice(0, 10)}</em></p>
</div>
`.trim();

const goods = [
  {
    id: id(),
    title: 'Акумулятор iPhone 11 (OEM-сумісний)',
    description: 'Якісний акумулятор, встановлення в сервісі, перевірка після монтажу.',
    price: 1290,
    image: '/img/phones/phones_main.png',
    images: ['/img/phones/tablet.jpg'],
    visible: true,
    category: 'Телефони',
    code: 'AKB-IP11',
  },
  {
    id: id(),
    title: 'Захисне скло 9H універсальне 6.1"',
    description: 'Загартоване скло з олеофобним покриттям. Підійде для більшості моделей 6.1".',
    price: 199,
    image: '/img/phones/phones_main.png',
    visible: true,
    category: 'Телефони',
    code: 'GLASS-61',
  },
  {
    id: id(),
    title: 'Термопаста CPU (шприц 2г)',
    description: 'Для ноутбуків і ПК. Нанесення майстром — за домовленістю.',
    price: 150,
    image: '/img/laptop-pc/laptop-1.jpg',
    images: ['/img/laptop-pc/pc.jpg'],
    visible: true,
    category: 'Ноутбуки та ПК',
    code: 'TP-2G',
  },
  {
    id: id(),
    title: 'Блок живлення ноутбука 19V 3.42A (універсальний)',
    description: 'Універсальний адаптер з набором роз’ємів. Перед покупкою узгодьте модель.',
    price: 890,
    image: '/img/laptop-pc/laptop-2.jpg',
    visible: true,
    category: 'Ноутбуки та ПК',
    code: 'PSU-19-342',
  },
  {
    id: id(),
    title: 'Пульт ДК універсальний для TV',
    description: 'Підходить до більшості популярних брендів. Налаштування за інструкцією.',
    price: 250,
    image: '/img/televizoru/tv-set.png',
    visible: true,
    category: 'Телевізори',
    code: 'RC-UNI',
  },
  {
    id: id(),
    title: 'Фільтр для кавомашини (водопідготовка)',
    description: 'Зменшує накип, подовжує ресурс. Уточніть сумісність моделі у майстра.',
    price: 450,
    image: '/img/coffee-machines/upper_coffee_machine.png',
    visible: true,
    category: 'Кавомашини',
    code: 'CF-FILTER',
  },
];

// Keep old hidden tests at end or drop them
data.goods = [...goods, ...(data.goods || []).filter((g) => !g.visible)];

const confident = (data.pages || []).find((p) => p.slug === 'confident' || p.id === 'confident');
if (confident) {
  confident.contentHtml = privacyHtml;
  confident.title = 'Політика конфіденційності';
  confident.description = 'Як Proper Service обробляє персональні дані клієнтів і відвідувачів сайту';
}

data.updatedAt = new Date().toISOString();
writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
console.log('Seeded goods:', goods.length, 'privacy updated');
