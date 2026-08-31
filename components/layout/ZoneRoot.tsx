'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { zoneFromPath } from '@/lib/zone';

export function ZoneRoot({ children, className }: { children: ReactNode; className?: string }) {
  const pathname = usePathname() || '/';
  const zone = zoneFromPath(pathname);

  return (
    <div className={className} id='up' data-zone={zone}>
      {children}
    </div>
  );
}
