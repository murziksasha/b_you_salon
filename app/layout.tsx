import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, Great_Vibes, Manrope } from 'next/font/google';
import { PwaRegister } from '@/components/PwaRegister';
import { ThemeProvider } from '@/components/layout/ThemeProvider';
import { getSiteData } from '@/lib/site-data';
import '@/styles/globals.scss';

const manrope = Manrope({ subsets: ['latin', 'cyrillic'], variable: '--font-sans' });
const cormorant = Cormorant_Garamond({
  subsets: ['latin', 'cyrillic'],
  weight: ['500', '600'],
  variable: '--font-serif',
});
const vibes = Great_Vibes({ subsets: ['latin'], weight: '400', variable: '--font-script' });

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6efe6' },
    { media: '(prefers-color-scheme: dark)', color: '#0d0d0d' },
  ],
};

/** Runs before paint. Default is dark luxury; migrate leftover ps-theme key. */
const THEME_BOOT =
  "(function(){try{var k='byou-theme';var p=localStorage.getItem(k)||localStorage.getItem('ps-theme')||'dark';var t;if(p==='light')t='light';else if(p==='system')t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';else t='dark';var r=document.documentElement;r.dataset.theme=t;r.style.colorScheme=t;}catch(e){document.documentElement.dataset.theme='dark';}})();";

export async function generateMetadata(): Promise<Metadata> {
  const data = await getSiteData();
  const title = data.settings.title;
  const description = data.settings.description;
  const base = process.env.SITE_URL?.replace(/\/$/, '') || undefined;

  return {
    metadataBase: base ? new URL(base) : undefined,
    title: {
      default: title,
      template: `%s | B_You`,
    },
    description,
    icons: { icon: data.settings.favicon },
    manifest: '/manifest.webmanifest',
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: 'B_You',
    },
    openGraph: {
      type: 'website',
      locale: 'uk_UA',
      title,
      description,
      siteName: 'B_You',
      images: [
        {
          url: data.settings.logo || '/img/icons/logo.png',
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [data.settings.logo || '/img/icons/logo.png'],
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang='uk' suppressHydrationWarning data-theme='dark' className={`${manrope.variable} ${cormorant.variable} ${vibes.variable}`}>
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <ThemeProvider>
          {children}
          <PwaRegister />
        </ThemeProvider>
      </body>
    </html>
  );
}
