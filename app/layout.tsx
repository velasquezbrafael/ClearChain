import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ClearChain — Crypto AML Analysis',
  description:
    'Open-source crypto wallet risk analysis with AI-generated SAR drafts. Risk scores, AML typologies, and plain-English narratives — in seconds.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body
        className="min-h-full flex flex-col"
        style={{ background: '#0a0a0f', color: '#e2e8f0', fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}
      >
        {/* Global header */}
        <header
          className="sticky top-0 z-50 border-b"
          style={{ background: 'rgba(13,13,20,0.92)', borderColor: '#1a1a24', backdropFilter: 'blur(12px)' }}
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <svg
                  className="w-6 h-6"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#00ff88"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
                <span
                  className="text-lg font-bold tracking-tight"
                  style={{ fontFamily: 'monospace', color: '#00ff88', letterSpacing: '0.04em' }}
                >
                  CLEARCHAIN
                </span>
              </div>
              <span
                className="hidden sm:block text-xs font-medium pl-2 ml-0.5"
                style={{ color: '#4b5563', borderLeft: '1px solid #1a1a24' }}
              >
                Crypto AML Analysis
              </span>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-3">
              <div
                className="hidden sm:flex items-center gap-1.5 text-xs font-mono"
                style={{ color: '#4b5563' }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full animate-pulse"
                  style={{ background: '#00ff88' }}
                />
                live
              </div>
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs font-medium transition-colors rounded-full px-3 py-1.5 hover:text-gray-200"
                style={{ color: '#6b7280', background: '#111118', border: '1px solid #1a1a24' }}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
                </svg>
                Open Source
              </a>
            </div>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="py-5 mt-10" style={{ borderTop: '1px solid #1a1a24' }}>
          <div
            className="max-w-7xl mx-auto px-4 sm:px-6 text-center text-xs font-mono"
            style={{ color: '#374151' }}
          >
            CLEARCHAIN v1 &mdash; AI-assisted analysis only. Not legal advice.
            SAR drafts require qualified BSA/AML officer review before filing.
          </div>
        </footer>
      </body>
    </html>
  );
}
