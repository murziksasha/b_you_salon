import Link from 'next/link';
import { SiteShell } from '@/components/layout/SiteShell';
import { getSiteData } from '@/lib/site-data';

export default async function NotFound() {
  const data = await getSiteData();
  const menu = data.headerMenu.filter((item) => item.visible);

  return (
    <SiteShell
      settings={data.settings}
      menu={menu}
      site={{
        headerMenu: data.headerMenu,
        headerMenuSalon: data.headerMenuSalon,
        headerMenuShop: data.headerMenuShop,
      }}
    >
      <section className='not-found wrapper'>
        <p className='not-found__code'>404</p>
        <h1 className='not-found__title _title'>Сторінку не знайдено</h1>
        <p className='not-found__text _paragr'>
          Можливо, посилання застаріле або сторінку приховано. Поверніться на головну або зателефонуйте нам.
        </p>
        <div className='not-found__actions'>
          <Link href='/' className='_btn'>
            На головну
          </Link>
          <a href={`tel:${data.settings.headerPhone.tel}`} className='_btn not-found__call'>
            {data.settings.headerPhone.display}
          </a>
        </div>
      </section>
    </SiteShell>
  );
}
