import Link from 'next/link';

export function BrandMark({ href = '/', className = 'by-mark' }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={className} aria-label='B_You — на головну'>
      Byou
      <span className='by-mark__heart' aria-hidden>
        ♥
      </span>
    </Link>
  );
}
