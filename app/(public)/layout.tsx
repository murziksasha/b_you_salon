import { SiteShell } from '@/components/layout/SiteShell';
import { getSiteData } from '@/lib/site-data';

export const dynamic = 'force-dynamic';

/**
 * Persistent public chrome — Header/Footer stay mounted across soft navigations
 * so logos and shared icons do not flash.
 */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
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
      {children}
    </SiteShell>
  );
}
