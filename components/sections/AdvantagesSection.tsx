import type { AdvantagesSection as AdvantagesSectionType } from '@/lib/types';
import { sanitizeHtml } from '@/lib/sanitize';

export function AdvantagesSection({ section }: { section: AdvantagesSectionType }) {
  return (
    <div className='by-adv'>
      {section.items.map((item, index) => (
        <div key={`${item.icon}-${index}`} className='by-adv__item'>
          <p dangerouslySetInnerHTML={{ __html: sanitizeHtml(item.textHtml) }} />
        </div>
      ))}
    </div>
  );
}
