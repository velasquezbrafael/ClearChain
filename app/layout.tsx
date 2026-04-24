import type { Metadata } from 'next';
import { Space_Grotesk, JetBrains_Mono, Inter, Nunito } from 'next/font/google';
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

export const metadata: Metadata = {
  title: 'ClearChain — Crypto AML Intelligence',
  description:
    'Know in 10 seconds whether a wallet is clean, connected to a mixer, or on a government sanctions list — with the SAR draft written automatically. Free, open source.',
  openGraph: {
    title: 'ClearChain — Crypto AML Intelligence',
    description:
      'Free OFAC screening, AML typology matching, transaction graph, and AI-generated SAR drafts for any Ethereum wallet.',
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
      className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} ${inter.variable} ${nunito.variable}`}
    >
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
