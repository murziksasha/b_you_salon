'use client';

import Link from 'next/link';
import { useCart } from './CartProvider';

export function AddToCartButton({
  productId,
  disabled,
  className = 'by-btn',
}: {
  productId: string;
  disabled?: boolean;
  className?: string;
}) {
  const { add, lines } = useCart();
  const inCart = lines.some((line) => line.id === productId);

  if (disabled) {
    return (
      <button type='button' className={className} disabled>
        Немає в наявності
      </button>
    );
  }

  if (inCart) {
    return (
      <Link href='/cart' className={`${className} is-in-cart`.trim()}>
        У кошику
      </Link>
    );
  }

  return (
    <button type='button' className={className} onClick={() => add(productId, 1)}>
      До кошика
    </button>
  );
}
