import { notFound } from 'next/navigation';

/**
 * Catch unknown /admin/* paths (e.g. /admin/l) so admin/not-found.tsx
 * renders inside the admin layout instead of the public SiteShell 404.
 * Specific routes (inbox, pages/[slug], …) take precedence over this catch-all.
 */
export default function AdminUnknownPathPage() {
  notFound();
}
