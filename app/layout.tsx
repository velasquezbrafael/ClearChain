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
  title: 'ClearChain — Crypto AML Intelligence',
  description:
    'Know in 10 seconds whether a wallet is clean, connected to a mixer, or on a government sanctions list — with the SAR draft written automatically. Free, open source.',
  openGraph: {
    title: 'ClearChain — Crypto AML Intelligence',
    description:
      'Free OFAC screening, AML typology matching, transaction graph, and AI-generated SAR drafts for any Ethereum, Bitcoin, or Tron wallet.',
    url: 'https://clearchain.vercel.app',
    siteName: 'ClearChain',
    type: 'website',
    images: ['/clearchainlogo.jpg'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ClearChain — Crypto AML Intelligence',
    description:
      'Free OFAC screening, AML typologies, transaction graph, and AI SAR drafts for any Ethereum wallet.',
    images: ['/clearchainlogo.jpg'],
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

        {/* Layer 0 — Subtle grid lines across entire page */}
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 0,
            pointerEvents: 'none',
            backgroundImage: `
              linear-gradient(rgba(6,182,212,0.05) 1px, transparent 1px),
              linear-gradient(90deg, rgba(6,182,212,0.05) 1px, transparent 1px)
            `,
            backgroundSize: '64px 64px',
          }}
        />

        {/* Layer 1 — Aurora blobs, full-page fixed */}
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1,
            pointerEvents: 'none',
            overflow: 'hidden',
          }}
        >
          {/* Blob 1 — large cyan, top-left, dominant hero glow */}
          <div style={{
            position: 'absolute', width: 1000, height: 1000, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(6,182,212,0.55) 0%, rgba(6,182,212,0.22) 40%, transparent 70%)',
            filter: 'blur(40px)',
            top: '-20%', left: '-15%',
            animation: 'auroraBlob1 20s ease-in-out infinite',
          }} />
          {/* Blob 2 — bright cyan, upper-right */}
          <div style={{
            position: 'absolute', width: 850, height: 850, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(34,211,238,0.45) 0%, rgba(34,211,238,0.15) 45%, transparent 70%)',
            filter: 'blur(50px)',
            top: '-8%', right: '-12%',
            animation: 'auroraBlob2 25s ease-in-out infinite',
          }} />
          {/* Blob 3 — green, mid-left */}
          <div style={{
            position: 'absolute', width: 750, height: 750, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(0,255,136,0.38) 0%, rgba(0,255,136,0.12) 50%, transparent 70%)',
            filter: 'blur(55px)',
            top: '35%', left: '-10%',
            animation: 'auroraBlob3 30s ease-in-out infinite',
          }} />
          {/* Blob 4 — violet/indigo, center-right */}
          <div style={{
            position: 'absolute', width: 950, height: 950, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(79,70,229,0.40) 0%, rgba(6,182,212,0.18) 50%, transparent 70%)',
            filter: 'blur(60px)',
            top: '15%', right: '-18%',
            animation: 'auroraBlob4 35s ease-in-out infinite',
          }} />
          {/* Blob 5 — violet, bottom-right — footer coverage */}
          <div style={{
            position: 'absolute', width: 800, height: 800, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(99,102,241,0.42) 0%, rgba(79,70,229,0.14) 50%, transparent 70%)',
            filter: 'blur(45px)',
            bottom: '-12%', right: '-10%',
            animation: 'auroraBlob2 28s ease-in-out infinite reverse',
          }} />
          {/* Blob 6 — cyan, mid-page — no dead zones mid-scroll */}
          <div style={{
            position: 'absolute', width: 650, height: 650, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(34,211,238,0.32) 0%, rgba(6,182,212,0.10) 55%, transparent 70%)',
            filter: 'blur(48px)',
            top: '58%', right: '8%',
            animation: 'auroraBlob1 22s ease-in-out infinite reverse',
          }} />
        </div>

        {/* Layer 2 — Horizontal scan line sweeping top→bottom on loop */}
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            height: 1,
            background: 'linear-gradient(90deg, transparent 0%, rgba(6,182,212,0.5) 30%, rgba(34,211,238,0.35) 70%, transparent 100%)',
            animation: 'auroraScanner 8s linear infinite',
            zIndex: 2,
            pointerEvents: 'none',
          }}
        />

        {/* Layer 3 — Page content */}
        <div style={{ position: 'relative', zIndex: 3 }}>
          {children}
        </div>
      </body>
    </html>
  );
}
