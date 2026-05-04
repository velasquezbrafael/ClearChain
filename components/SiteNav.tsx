'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export type ActivePage = 'docs' | 'api-docs' | 'intel';

interface SiteNavProps {
  activePage?: ActivePage;
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  const activeColor = '#22d3ee';
  const dimColor = 'var(--text-dim)';
  const hoverColor = 'var(--text-secondary)';

  return (
    <a
      href={href}
      style={{
        fontFamily: 'var(--font-jetbrains-mono)',
        fontSize: 10,
        letterSpacing: '0.1em',
        color: active ? activeColor : hovered ? hoverColor : dimColor,
        textDecoration: 'none',
        transition: 'color 0.15s',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
    </a>
  );
}

export default function SiteNav({ activePage }: SiteNavProps) {
  const [navUser, setNavUser] = useState<boolean | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setNavUser(!!user);
    });
  }, []);

  return (
    <nav
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        height: 'calc(56px + env(safe-area-inset-top))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 'env(safe-area-inset-top)',
        paddingLeft: 32,
        paddingRight: 32,
        borderBottom: '1px solid rgba(6,182,212,0.08)',
        background: 'rgba(0,8,15,0.75)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}
    >
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <span
            style={{
              fontFamily: 'var(--font-rubik-glitch)',
              fontSize: 15,
              fontWeight: 400,
              letterSpacing: '0.15em',
              color: '#22d3ee',
              animation: 'glitch 6s steps(1) infinite',
              display: 'inline-block',
            }}
          >
            CLEARCHAIN
          </span>
        </Link>
        {!isMobile && (
          <span
            style={{
              fontFamily: 'var(--font-inter)',
              fontSize: 12,
              color: 'var(--text-dim)',
              paddingLeft: 12,
              borderLeft: '1px solid rgba(6,182,212,0.08)',
            }}
          >
            Crypto Intelligence Platform
          </span>
        )}
      </div>

      {/* Right side */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        {!isMobile && (
          <>
            <NavLink href="/docs" active={activePage === 'docs'}>DOCS</NavLink>
            <NavLink href="/api-docs" active={activePage === 'api-docs'}>API</NavLink>
            <NavLink href="/intel" active={activePage === 'intel'}>INTEL →</NavLink>

            {/* Chain status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#06b6d4',
                  boxShadow: '0 0 8px rgba(6,182,212,0.8)',
                  animation: 'pulseGlow 2s ease-in-out infinite',
                }}
              />
              <span
                style={{
                  fontFamily: 'var(--font-jetbrains-mono)',
                  fontSize: 10,
                  letterSpacing: '0.1em',
                  color: 'var(--text-dim)',
                }}
              >
                ETH · BTC · TRX · SOL
              </span>
            </div>
          </>
        )}

        {/* Auth */}
        {navUser === true && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              paddingLeft: 12,
              borderLeft: '1px solid rgba(6,182,212,0.08)',
            }}
          >
            <a
              href="/dashboard"
              style={{
                fontFamily: 'var(--font-jetbrains-mono)',
                fontSize: 10,
                letterSpacing: '0.1em',
                color: 'var(--accent-green)',
                textDecoration: 'none',
              }}
            >
              DASHBOARD →
            </a>
          </div>
        )}
        {navUser === false && (
          <a
            href="/auth/login"
            style={{
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: 10,
              letterSpacing: '0.1em',
              color: 'var(--text-dim)',
              textDecoration: 'none',
              paddingLeft: 12,
              borderLeft: '1px solid rgba(6,182,212,0.08)',
            }}
          >
            SIGN IN →
          </a>
        )}
      </div>
    </nav>
  );
}
