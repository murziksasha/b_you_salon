'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className='not-found wrapper' style={{ padding: '4rem 1.2rem', textAlign: 'center' }}>
      <h1 className='_title'>Щось пішло не так</h1>
      <p className='_paragr'>Спробуйте оновити сторінку або повернутись назад.</p>
      <button type='button' className='by-btn' onClick={reset}>
        Спробувати знову
      </button>
    </section>
  );
}
