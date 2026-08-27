import { sanitizeHtml } from '@/lib/sanitize';
import type { RichTextSection as RichTextSectionType } from '@/lib/types';

export function RichTextSection({ section }: { section: RichTextSectionType }) {
  if (!section.html?.trim()) return null;
  return (
    <section className='by-section'>
      <div
        className='by-wrap content-page__body'
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(section.html) }}
      />
    </section>
  );
}
