'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { isIosDevice, isPwaDismissed, isStandaloneMode, PWA_DISMISS_KEY } from '@/lib/pwa-install';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Dismissible install hint for visitors on public pages.
 * Shows native install prompt trigger on Chrome/Edge or Share instructions on iOS.
 * Hides on /admin, when in standalone mode, or when dismissed.
 */
export function PwaInstallHint() {
  const pathname = usePathname() || '/';
  const [mounted, setMounted] = useState(false);
  const [cookieDone, setCookieDone] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    setMounted(true);

    if (isStandaloneMode(window)) {
      setDismissed(true);
      return;
    }

    try {
      if (isPwaDismissed(localStorage.getItem(PWA_DISMISS_KEY))) {
        setDismissed(true);
        return;
      }
    } catch {
      // localStorage may fail in restricted contexts
    }

    const checkCookie = () => {
      const bannerState = document.documentElement.getAttribute('data-cookie-banner');
      setCookieDone(bannerState === 'done');
    };
    checkCookie();

    const observer = new MutationObserver(mutations => {
      for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === 'data-cookie-banner') {
          checkCookie();
        }
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-cookie-banner'] });

    const ios = isIosDevice(navigator.userAgent, navigator.maxTouchPoints);
    setIsIos(ios);

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);

    return () => {
      observer.disconnect();
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    };
  }, []);

  if (!mounted) return null;
  if (pathname.startsWith('/admin')) return null;
  if (dismissed || !cookieDone) return null;
  if (!deferredPrompt && !isIos) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(PWA_DISMISS_KEY, '1');
    } catch {
      // storage unavailable
    }
  };

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setDismissed(true);
      }
    } catch {
      // prompt failed or was cancelled
    } finally {
      setDeferredPrompt(null);
    }
  };

  return (
    <aside className='pwa-install-hint' aria-label='Встановлення додатку'>
      <div className='pwa-install-hint__inner'>
        <div className='pwa-install-hint__content'>
          <p className='pwa-install-hint__title'>Встановіть B_You на екран</p>
          <p className='pwa-install-hint__desc'>
            {isIos ? (
              <>
                Натисніть <Share className='pwa-install-hint__inline-icon' size={14} aria-hidden='true' />{' '}
                <strong>«Поділитися»</strong> в браузері, потім оберіть <strong>«На Початковий екран»</strong>.
              </>
            ) : (
              'Швидкий доступ до салону та магазину в окремому вікні без рядка браузера.'
            )}
          </p>
        </div>

        <div className='pwa-install-hint__actions'>
          {deferredPrompt && (
            <button
              type='button'
              onClick={handleInstallClick}
              className='by-btn pwa-install-hint__btn'
            >
              <Download size={14} aria-hidden='true' />
              <span>Встановити</span>
            </button>
          )}
          <button
            type='button'
            onClick={handleDismiss}
            className='pwa-install-hint__close'
            aria-label='Закрити підказку'
          >
            <X size={16} aria-hidden='true' />
          </button>
        </div>
      </div>
    </aside>
  );
}

