import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
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

export const metadata: Metadata = {
  title: 'Mehfil — AI-native restaurant OS',
  description: 'Modern POS, QR ordering, and AI waiter for Indian cafes.',
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  ),
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="bg-bg text-fg antialiased">
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
