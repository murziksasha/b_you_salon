import type { DoorsHeroSection as DoorsHeroSectionType } from '@/lib/types';

export function DoorsHeroSection({ section }: { section: DoorsHeroSectionType }) {
  const leftSrc = section.left.image || section.image;
  const rightSrc = section.right.image || section.image;
  return (
    <section className='doors' aria-label='Оберіть напрям'>
      <div className='doors__brand'>
        {section.kicker ? <p className='doors__kicker'>{section.kicker}</p> : null}
        {section.title ? <h1 className='doors__title'>{section.title}</h1> : null}
        {section.subtitle ? <p className='doors__sub'>{section.subtitle}</p> : null}
      </div>
      <div className='doors__split' aria-hidden />
      <a className='doors__half doors__half--left' href={section.left.href}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className='doors__img' src={leftSrc} alt={section.imageAlt || section.left.title} />
        <span className='doors__shade' />
        <span className='doors__copy'>
          <span className='doors__label'>{section.left.label}</span>
          <span className='doors__name'>{section.left.title}</span>
          <span className='doors__lead'>{section.left.subtitle}</span>
          <span className='doors__cta'>{section.left.cta}</span>
        </span>
      </a>
      <a className='doors__half doors__half--right' href={section.right.href}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className='doors__img' src={rightSrc} alt={section.imageAlt || section.right.title} />
        <span className='doors__shade' />
        <span className='doors__copy'>
          <span className='doors__label'>{section.right.label}</span>
          <span className='doors__name'>{section.right.title}</span>
          <span className='doors__lead'>{section.right.subtitle}</span>
          <span className='doors__cta'>{section.right.cta}</span>
        </span>
      </a>
    </section>
  );
}
