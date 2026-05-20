import type { Metadata } from 'next';
import { Geist, Geist_Mono, Outfit } from 'next/font/google';
import { Toaster } from 'sonner';
import './globals.css';

const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
  display: 'swap',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
});

// Outfit — a free geometric sans used as a Gilroy stand-in for the brand /
// marketing surfaces. Swap to licensed Gilroy via next/font/local when available.
const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
  weight: ['400', '500', '600', '700', '800'],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

const DESCRIPTION =
  'Sangam is an affordable, AI-native restaurant POS for Indian restaurants, cafes & cloud kitchens — QR table ordering, an AI waiter, UPI payments, GST billing, and end-of-day reconciliation. 0% commission, and your data stays yours.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Sangam — the AI-native POS for Indian restaurants & cafes',
  description: DESCRIPTION,
  applicationName: 'Sangam',
  keywords: [
    'restaurant POS',
    'restaurant POS India',
    'cafe POS India',
    'QR code ordering',
    'AI waiter',
    'cloud kitchen software',
    'GST billing software',
    'UPI POS',
    'restaurant billing software',
    'Sangam',
  ],
  authors: [{ name: 'Sangam' }],
  creator: 'Sangam',
  alternates: { canonical: '/' },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  openGraph: {
    type: 'website',
    siteName: 'Sangam',
    title: 'Sangam — the AI-native POS for Indian restaurants & cafes',
    description: DESCRIPTION,
    url: SITE_URL,
    locale: 'en_IN',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sangam — the AI-native POS for Indian restaurants & cafes',
    description: DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${outfit.variable}`}
      suppressHydrationWarning
    >
      <body className="bg-bg text-fg antialiased">
        {/* Apply saved theme before paint to avoid a flash. Default = light. */}
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: tiny inline theme bootstrap
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}",
          }}
        />
        {children}
        <Toaster
          position="top-center"
          toastOptions={{
            classNames: {
              toast:
                'rounded-lg border border-border bg-bg text-fg shadow-md shadow-black/[0.08]',
            },
          }}
        />
      </body>
    </html>
  );
}
