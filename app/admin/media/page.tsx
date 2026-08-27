import { AdminShell } from '@/components/admin/AdminShell';
import { MediaLibrary } from '@/components/admin/MediaLibrary';

export const dynamic = 'force-dynamic';

export default function AdminMediaPage() {
  return (
    <AdminShell>
      <h1>Медіатека</h1>
      <p className='admin-hint admin-mb-lg'>
        Тематичні <strong>папки</strong> (зліва) і <strong>роль</strong> (товар / hero…) — для
        сортування та швидкого вибору. URL лишається <code>/uploads/…</code>. Великі
        зображення зменшуються; JPEG → WebP; PNG/GIF без зміни формату.
      </p>
      <MediaLibrary />
    </AdminShell>
  );
}
