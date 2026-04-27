import type { Metadata } from 'next';
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

export const metadata: Metadata = {
  title: 'ClearChain — Crypto AML Intelligence',
  description:
    'Know in 10 seconds whether a wallet is clean, connected to a mixer, or on a government sanctions list — with the SAR draft written automatically. Free, open source.',
  openGraph: {
    title: 'ClearChain — Crypto AML Intelligence',
    description:
      'Free OFAC screening, AML typology matching, transaction graph, and AI-generated SAR drafts for any Ethereum, Bitcoin, or Tron wallet.',
    url: 'https://clear-chain-peach.vercel.app',
    siteName: 'ClearChain',
    type: 'website',
    images: [
      {
        url: 'https://clear-chain-peach.vercel.app/og-image.png',
        width: 1200,
        height: 630,
        alt: 'ClearChain — Crypto AML Intelligence Platform',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ClearChain — Crypto AML Intelligence',
    description:
      'Free OFAC screening, AML typologies, transaction graph, and AI SAR drafts for any Ethereum wallet.',
    images: ['https://clear-chain-peach.vercel.app/og-image.png'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} ${inter.variable} ${nunito.variable} ${rubikGlitch.variable}`}
    >
      <body className="min-h-screen antialiased">
        {/* Bypass build CSS stripping — inject backdrop-filter directly */}
        <style dangerouslySetInnerHTML={{ __html: `.glass { backdrop-filter: blur(20px) !important; -webkit-backdrop-filter: blur(20px) !important; }` }} />
        {/* Aurora — fixed decorative blobs, z-index 0, no interaction */}
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 0,
            pointerEvents: 'none',
            overflow: 'hidden',
          }}
        >
          <div style={{
            position: 'absolute', width: 640, height: 640, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(6,182,212,0.11) 0%, transparent 70%)',
            top: '-8%', left: '-4%',
            animation: 'auroraBlob1 20s ease-in-out infinite',
          }} />
          <div style={{
            position: 'absolute', width: 520, height: 520, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(6,182,212,0.07) 0%, transparent 70%)',
            top: '38%', right: '-7%',
            animation: 'auroraBlob2 25s ease-in-out infinite',
          }} />
          <div style={{
            position: 'absolute', width: 440, height: 440, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(34,211,238,0.06) 0%, transparent 70%)',
            bottom: '-4%', left: '28%',
            animation: 'auroraBlob3 30s ease-in-out infinite',
          }} />
        </div>
        {/* Content above aurora */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          {children}
        </div>
      </body>
    </html>
  );
}
