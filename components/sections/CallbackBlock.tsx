import type { CallbackSection as CallbackSectionType, SalonService } from '@/lib/types';
import { CallbackForm } from '@/components/forms/CallbackForm';
import { sanitizeHtml } from '@/lib/sanitize';

export function CallbackBlock({
  section,
  services = [],
}: {
  section: CallbackSectionType;
  services?: SalonService[];
}) {
  return (
    <div className='by-callback-block' id='callback-form'>
      <h2
        className='by-section__title'
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(section.titleHtml ?? section.title) }}
      />
      <CallbackForm
        buttonText={section.buttonText}
        buttonHtml={section.buttonHtml}
        placeholder={section.placeholder}
        services={services}
        activeServiceId={section.activeServiceId}
      />
    </div>
  );
}