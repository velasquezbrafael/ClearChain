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
        <style dangerouslySetInnerHTML={{ __html: `.glass { backdrop-filter: blur(28px) !important; -webkit-backdrop-filter: blur(28px) !important; }` }} />
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
          {/* Blob 1 — large cyan, top-left */}
          <div style={{
            position: 'absolute', width: 800, height: 800, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(6,182,212,0.22) 0%, transparent 70%)',
            top: '-12%', left: '-8%',
            animation: 'auroraBlob1 20s ease-in-out infinite',
          }} />
          {/* Blob 2 — violet, mid-right */}
          <div style={{
            position: 'absolute', width: 700, height: 700, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(79,70,229,0.18) 0%, transparent 70%)',
            top: '30%', right: '-10%',
            animation: 'auroraBlob2 25s ease-in-out infinite',
          }} />
          {/* Blob 3 — cyan, bottom-center */}
          <div style={{
            position: 'absolute', width: 600, height: 600, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(34,211,238,0.16) 0%, transparent 70%)',
            bottom: '-8%', left: '25%',
            animation: 'auroraBlob3 30s ease-in-out infinite',
          }} />
          {/* Blob 4 — deep violet, top-right — bleeds into results area */}
          <div style={{
            position: 'absolute', width: 500, height: 500, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(99,102,241,0.14) 0%, transparent 70%)',
            top: '10%', right: '15%',
            animation: 'auroraBlob2 35s ease-in-out infinite reverse',
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
