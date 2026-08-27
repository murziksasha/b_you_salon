import type { MalfunctionsSection as MalfunctionsSectionType } from '@/lib/types';
import { PublicImage } from '@/components/ui/PublicImage';

export function MalfunctionsSection({ section }: { section: MalfunctionsSectionType }) {
  return (
    <div className="malfunctions">
      <div className="wrapper-malfunctions-under">
        <h2 className="about-link__title _title">{section.title}</h2>
        <div className="malfunctions__line line">
          <div className="line__circle line__circle_right line__circle_right-black" />
        </div>
      </div>
      <div className="wrapper-malfunctions-under">
        <div className="malfunctions__left-side">
          <p className="about-link__paragr repair-item">{section.intro}</p>
          <ul className="malfunctions__items">
            {section.items.map((item) => (
              <li key={item} className="malfunctions__item">{item}</li>
            ))}
          </ul>
        </div>
        <div className="malfunctions__right-side">
          <PublicImage
            src={section.image}
            alt={section.imageAlt}
            width={400}
            height={300}
            className={section.imageClass ?? 'malfunctions__img'}
            sizes="(max-width: 768px) 90vw, 400px"
          />
        </div>
      </div>
    </div>
  );
}
