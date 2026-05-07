import type { Metadata, Viewport } from 'next';
import { Space_Grotesk, JetBrains_Mono, Inter, Nunito, Rubik_Glitch } from 'next/font/google';
import './globals.css';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-inter',
  display: 'swap',
});

const nunito = Nunito({
  subsets: ['latin'],
  weight: ['900'],
  variable: '--font-nunito',
  display: 'swap',
});

const rubikGlitch = Rubik_Glitch({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-rubik-glitch',
  display: 'swap',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: 'ClearChain — Check Any Wallet Before You Send',
  description:
    'Know in seconds if a wallet is safe to send to. Free scam detection, sanctions screening, and risk scores for any ETH, BTC, TRX, or SOL address.',
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/favicon.ico',
  },
  openGraph: {
    title: 'ClearChain — Check Any Wallet Before You Send',
    description:
      'Know in seconds if a wallet is safe to send to. Free scam detection, sanctions screening, and risk scores for any ETH, BTC, TRX, or SOL address.',
    url: 'https://clearchain.vercel.app',
    siteName: 'ClearChain',
    type: 'website',
    images: ['/og-image.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ClearChain — Check Any Wallet Before You Send',
    description:
      'Know in seconds if a wallet is safe to send to. Free scam detection, sanctions screening, and risk scores for any ETH, BTC, TRX, or SOL address.',
    images: ['/og-image.png'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} ${inter.variable} ${nunito.variable} ${rubikGlitch.variable}`}
    >
      <body className="min-h-screen antialiased">
        {/* Disable browser scroll restoration so the page always starts at top */}
        <script dangerouslySetInnerHTML={{ __html: "if(window.history.scrollRestoration)window.history.scrollRestoration='manual';" }} />
        {/* Bypass build CSS stripping — inject backdrop-filter directly */}
        <style dangerouslySetInnerHTML={{ __html: `.glass { backdrop-filter: blur(28px) !important; -webkit-backdrop-filter: blur(28px) !important; }` }} />

        {/* Scan line — sweeps top→bottom every 8s, behind all page content */}
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            height: 1,
            background: 'linear-gradient(90deg, transparent 0%, rgba(6,182,212,0.2) 30%, rgba(34,211,238,0.12) 70%, transparent 100%)',
            animation: 'auroraScanner 8s linear infinite',
            zIndex: 0,
            pointerEvents: 'none',
          }}
        />

        {/* Page content */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          {children}
        </div>
      </body>
    </html>
  );
}
