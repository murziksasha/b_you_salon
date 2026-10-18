import type { AdvantagesSection as AdvantagesSectionType } from '@/lib/types';
import { sanitizeHtml } from '@/lib/sanitize';

export function AdvantagesSection({ section }: { section: AdvantagesSectionType }) {
  return (
    <ul className='by-adv'>
      {section.items.map((item, index) => (
        <li key={`${item.icon}-${index}`} className='by-adv__item'>
          <p dangerouslySetInnerHTML={{ __html: sanitizeHtml(item.textHtml) }} />
        </li>
      ))}
    </ul>
  );
}
