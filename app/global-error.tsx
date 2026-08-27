'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang='uk'>
      <body style={{ margin: 0, background: '#0d0d0d', color: '#f5ede4', fontFamily: 'system-ui, sans-serif' }}>
        <main style={{ padding: '4rem 1.2rem', textAlign: 'center' }}>
          <h1>Критична помилка</h1>
          <p>{error.message || 'Невідома помилка'}</p>
          <button type='button' onClick={reset} style={{ padding: '0.6rem 1rem', cursor: 'pointer' }}>
            Спробувати знову
          </button>
        </main>
      </body>
    </html>
  );
}
