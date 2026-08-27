import Link from 'next/link';
import { BrandMark } from '@/components/brand/BrandMark';

export default function AdminNotFound() {
  return (
    <div className='admin-body admin-login'>
      <div className='admin-login-card'>
        <BrandMark href='/admin' className='admin-login-wordmark' />
        <p className='admin-login-brand'>Адмінка студії</p>
        <h1>Сторінку не знайдено</h1>
        <p className='admin-hint'>
          Такого розділу адмінки немає. Перевірте адресу або поверніться на огляд.
        </p>
        <Link href='/admin' className='admin-btn admin-btn--block'>
          До огляду
        </Link>
      </div>
    </div>
  );
}
